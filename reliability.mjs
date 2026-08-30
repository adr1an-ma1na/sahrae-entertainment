/**
 * Consistency, which is not the same thing as working.
 *
 * Every other check here takes ONE sample. That is enough to catch a dead host
 * and useless for catching a flaky one — and flaky is worse for a viewer than
 * dead, because a dead source gets skipped once while a flaky one fails on the
 * fourth episode of a binge with no explanation.
 *
 * This came from a real disagreement in the data: vidsrc.sbs answered 403 on one
 * pass and 200 on the next. A single sample would have either wrongly condemned
 * it or wrongly promoted it into the shipping list. So each provider is asked
 * repeatedly, with a pause between rounds, and judged on how often it answers
 * rather than whether it answered once.
 *
 * Latency spread matters too. A source averaging 600ms but occasionally taking
 * eight seconds feels broken, because the viewer has already hit "next server"
 * by then. p50 and worst-case are both reported for that reason.
 *
 * Run: node reliability.mjs [rounds]
 */

const ROUNDS = Number(process.argv[2]) || 5;
const GAP_MS = 1500;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;

const TARGETS = [
  ['vidfast',   'https://vidfast.pro/movie/550',           true],
  ['videasy',   'https://player.videasy.net/movie/550',    true],
  ['vidlink',   'https://vidlink.pro/movie/550',           true],
  ['vidsrccc',  'https://vidsrc.cc/v3/embed/movie/550',    true],
  ['vidsrcto',  'https://vidsrc.to/embed/movie/550',       true],
  ['vidsrcsu',  'https://vidsrc.su/embed/movie/550',       true],
  ['autoembed', 'https://autoembed.co/movie/tmdb/550',     true],
  ['2embed',    'https://www.2embed.cc/embed/550',         true],
  ['vidsrcme',  'https://vidsrc.me/embed/movie?tmdb=550',  true],
  ['vidsrcsbs', 'https://vidsrc.sbs/embed/movie/550',      false], // the inconsistent one
  ['111movies', 'https://111movies.com/movie/550',         false],
  ['vidapi',    'https://vidapi.xyz/embed/movie/550',      false],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(url) {
  const t = Date.now();
  try {
    const r = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    });
    const html = await r.text().catch(() => '');
    const good = r.status >= 200 && r.status < 400 &&
      (/<iframe|<video|jwplayer|playerjs|hls\.js|\.m3u8/i.test(html) ||
       /__NEXT_DATA__|<div id="(root|app|__next)"|\/_next\/|\/assets\/.*\.js/i.test(html));
    return { good, ms: Date.now() - t, status: r.status };
  } catch (e) {
    return { good: false, ms: Date.now() - t, status: e.name === 'TimeoutError' ? 'timeout' : 'error' };
  }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };

console.log(`\n  ${ROUNDS} rounds per provider, ${GAP_MS}ms apart. ● = currently shipping.\n`);

const stats = new Map(TARGETS.map(([id]) => [id, { ok: 0, times: [], codes: [] }]));

for (let round = 1; round <= ROUNDS; round++) {
  process.stdout.write(`  round ${round}/${ROUNDS} `);
  const res = await Promise.all(TARGETS.map(([, url]) => once(url)));
  TARGETS.forEach(([id], i) => {
    const s = stats.get(id);
    if (res[i].good) { s.ok++; s.times.push(res[i].ms); }
    s.codes.push(res[i].status);
    process.stdout.write(res[i].good ? G('·') : R('x'));
  });
  console.log();
  if (round < ROUNDS) await sleep(GAP_MS);
}

console.log('\n  ' + '  id'.padEnd(15) + 'success'.padEnd(12) + 'p50'.padEnd(10) + 'worst'.padEnd(10) + 'codes seen');
console.log('  ' + '─'.repeat(80));

const out = [];
for (const [id, , shipping] of TARGETS) {
  const s = stats.get(id);
  const rate = s.ok / ROUNDS;
  const p50 = median(s.times);
  const worst = s.times.length ? Math.max(...s.times) : 0;
  const codes = [...new Set(s.codes)].join(',');
  const col = rate === 1 ? G : rate >= 0.8 ? Y : R;
  console.log('  ' + (shipping ? G('● ') : '  ') + id.padEnd(13) +
    col(`${s.ok}/${ROUNDS}`).padEnd(12 + 9) +
    (p50 ? p50 + 'ms' : '—').padEnd(10) +
    (worst ? worst + 'ms' : '—').padEnd(10) + D(codes));
  out.push({ id, shipping, rate, p50, worst });
}

console.log('\n' + '═'.repeat(82));
const perfect = out.filter((o) => o.rate === 1).sort((a, b) => a.p50 - b.p50);
const flaky = out.filter((o) => o.rate > 0 && o.rate < 1);
const broken = out.filter((o) => o.rate === 0);

console.log(`\n  ${G('Answered every time')} (${perfect.length}) — fastest first:`);
perfect.forEach((o) => console.log(`    ${o.shipping ? G('●') : ' '} ${o.id.padEnd(12)} p50 ${String(o.p50 + 'ms').padEnd(8)} worst ${o.worst}ms`));
if (flaky.length) {
  console.log(`\n  ${Y('Intermittent')} — works, but not dependably. Fine as a fallback, wrong as a default:`);
  flaky.forEach((o) => console.log(`    ${o.shipping ? G('●') : ' '} ${o.id.padEnd(12)} ${Math.round(o.rate * 100)}% of attempts`));
}
if (broken.length) console.log(`\n  ${R('Never answered from here')}: ${broken.map((o) => (o.shipping ? '●' : '') + o.id).join(', ')}`);
console.log();
