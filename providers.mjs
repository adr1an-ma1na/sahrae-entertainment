/**
 * Evaluates movie/series embed providers, so the shipping list is chosen rather
 * than inherited.
 *
 * `audit.mjs` asks whether what we ship still works. This asks a different
 * question: what SHOULD we ship? Run it when a source degrades, when the list
 * needs refreshing, or before a release. Providers in this space appear and rot
 * quickly, so the answer has a shelf life measured in months.
 *
 * THREE ROUNDS, EACH DISQUALIFYING
 *
 *   1. Alive        Does it answer, and is it a real page? Crucially, DNS is
 *                   checked separately: NXDOMAIN means gone, while a name that
 *                   resolves but will not connect is probably blocked on this
 *                   network. Confusing those two condemned three working
 *                   servers once.
 *
 *   2. Complete     Does it serve BOTH a film and an episode? A source that
 *                   handles films but not series looks fine until someone opens
 *                   episode three.
 *
 *   3. Watchable    Can it be framed at all, and what is the ad load? A provider
 *                   sending X-Frame-Options renders a blank box no matter how
 *                   good its streams are. And a 4K stream behind three
 *                   popunders is not a good viewing experience — the ad layer
 *                   is part of quality, not separate from it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not measure bitrate, codec or audio-channel count. Those live inside
 * each provider's player behind obfuscation that exists to prevent exactly that,
 * and prying it open would be defeating a technical protection. Capability
 * columns below are what a provider CLAIMS for itself. Treat them as claims.
 *
 * Run: node providers.mjs
 */

const MOVIE = 550;   // Fight Club — old, popular, in every catalogue
const SHOW = 1396;   // Breaking Bad — S1E1 exists everywhere
const TIMEOUT = 15_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;

/** [id, movie url, episode url, home page, currently shipping?] */
const FIELD = [
  ['vidfast',    `https://vidfast.pro/movie/${MOVIE}`,               `https://vidfast.pro/tv/${SHOW}/1/1`,               'https://vidfast.pro',      true],
  ['videasy',    `https://player.videasy.net/movie/${MOVIE}`,        `https://player.videasy.net/tv/${SHOW}/1/1`,        'https://www.videasy.net',  true],
  ['vidlink',    `https://vidlink.pro/movie/${MOVIE}`,               `https://vidlink.pro/tv/${SHOW}/1/1`,               'https://vidlink.pro',      true],
  ['vidsrccc',   `https://vidsrc.cc/v3/embed/movie/${MOVIE}`,        `https://vidsrc.cc/v3/embed/tv/${SHOW}/1/1`,        'https://vidsrc.cc',        true],
  ['vidsrcto',   `https://vidsrc.to/embed/movie/${MOVIE}`,           `https://vidsrc.to/embed/tv/${SHOW}/1/1`,           'https://vidsrc.to',        true],
  ['vidsrcsu',   `https://vidsrc.su/embed/movie/${MOVIE}`,           `https://vidsrc.su/embed/tv/${SHOW}/1/1`,           'https://vidsrc.su',        true],
  ['autoembed',  `https://autoembed.co/movie/tmdb/${MOVIE}`,         `https://autoembed.co/tv/tmdb/${SHOW}-1-1`,         'https://autoembed.co',     true],
  ['2embed',     `https://www.2embed.cc/embed/${MOVIE}`,             `https://www.2embed.cc/embedtv/${SHOW}&s=1&e=1`,    'https://www.2embed.cc',    true],
  ['vidsrcme',   `https://vidsrc.me/embed/movie?tmdb=${MOVIE}`,      `https://vidsrc.me/embed/tv?tmdb=${SHOW}&season=1&episode=1`, 'https://vidsrc.me', true],

  // Not shipping — kept so a rotation has candidates already measured.
  ['multiembed', `https://multiembed.mov/?video_id=${MOVIE}&tmdb=1`, `https://multiembed.mov/?video_id=${SHOW}&tmdb=1&s=1&e=1`, 'https://multiembed.mov', false],
  ['vidbolt',    `https://vidbolt.pro/embed/movie/${MOVIE}`,         `https://vidbolt.pro/embed/tv/${SHOW}/1/1`,         'https://vidbolt.pro',      false],
  ['vidapi',     `https://vidapi.xyz/embed/movie/${MOVIE}`,          `https://vidapi.xyz/embed/tv/${SHOW}&s=1&e=1`,      'https://vidapi.xyz',       false],
  ['vidsrcsbs',  `https://vidsrc.sbs/embed/movie/${MOVIE}`,          `https://vidsrc.sbs/embed/tv/${SHOW}/1/1`,          'https://vidsrc.sbs',       false],
  ['111movies',  `https://111movies.com/movie/${MOVIE}`,             `https://111movies.com/tv/${SHOW}/1/1`,             'https://111movies.com',    false],
  ['vidbinge',   `https://vidbinge.com/embed/movie/${MOVIE}`,        `https://vidbinge.com/embed/tv/${SHOW}/1/1`,        'https://vidbinge.com',     false],
  ['vidsrcpro',  `https://vidsrc.pro/embed/movie/${MOVIE}`,          `https://vidsrc.pro/embed/tv/${SHOW}/1/1`,          'https://vidsrc.pro',       false],
];

/** Popunder and ad networks common to this corner of the web. */
const AD_NETWORKS = ['propellerads', 'popads', 'popcash', 'adsterra', 'hilltopads', 'exoclick',
  'juicyads', 'trafficjunky', 'clickadu', 'monetag', 'onclicka', 'poptm', 'popunder',
  'adcash', 'bidvertiser', 'revenuecpmgate', 'profitablecpm', 'highperformanceformat', 'galaksion'];

/** Public DNS — the only way to tell "gone" from "blocked here". */
async function resolves(host) {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, {
      headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    if (j.Status === 3) return 'NXDOMAIN';
    return j.Answer?.some((a) => a.type === 1 || a.type === 5) ? 'ok' : 'no-A';
  } catch { return 'dns-fail'; }
}

async function get(url) {
  const t = Date.now();
  try {
    const r = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    return { status: r.status, ms: Date.now() - t, html: await r.text().catch(() => ''), headers: r.headers, final: r.url };
  } catch (e) {
    return { status: 0, ms: Date.now() - t, html: '', err: e.name === 'TimeoutError' ? 'timeout' : String(e.message).slice(0, 30) };
  }
}

/**
 * A player is either in the HTML or mounted by JavaScript. Testing only the
 * first calls every modern React-based provider broken.
 */
function servesVideo(html) {
  if (/domain (is )?for sale|parked|buy this domain|coming soon/i.test(html)) return false;
  if (/<iframe|<video|jwplayer|playerjs|hls\.js|\.m3u8|sources\s*[:=]/i.test(html)) return true;
  return /__NEXT_DATA__|<div id="(root|app|__next)"|\/_next\/|\/assets\/.*\.js/i.test(html);
}

/** A provider that forbids framing is unusable here, whatever its streams. */
function framable(headers) {
  if (!headers) return null;
  const xfo = (headers.get('x-frame-options') || '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return `no (${xfo})`;
  const fa = (headers.get('content-security-policy') || '').toLowerCase().match(/frame-ancestors ([^;]+)/)?.[1]?.trim();
  if (fa && !/[*]|https:/.test(fa)) return `no (${fa.slice(0, 20)})`;
  return 'yes';
}

function claims(html) {
  const t = html.toLowerCase();
  const c = [];
  if (/\b4k\b|2160p|ultra.?hd/.test(t)) c.push('4K');
  if (/\bhdr\b|dolby vision/.test(t)) c.push('HDR');
  if (/5\.1|7\.1|dolby|atmos|surround/.test(t)) c.push('5.1');
  if (/subtitle|caption|\bsrt\b|\bvtt\b/.test(t)) c.push('subs');
  return c;
}

console.log(`\n  Evaluating ${FIELD.length} providers. ● = currently shipping.\n`);
console.log('  ' + '  id'.padEnd(15) + 'dns'.padEnd(10) + 'film'.padEnd(11) + 'episode'.padEnd(11) + 'frame'.padEnd(9) + 'ads'.padEnd(7) + 'claims');
console.log('  ' + '─'.repeat(94));

const rows = [];
for (const [id, mUrl, tUrl, home, shipping] of FIELD) {
  const dns = await resolves(new URL(mUrl).hostname);
  if (dns === 'NXDOMAIN') {
    console.log('  ' + (shipping ? G('● ') : '  ') + id.padEnd(13) + R('NXDOMAIN  — domain no longer exists'));
    rows.push({ id, shipping, ok: false, why: 'NXDOMAIN' });
    continue;
  }

  const [m, t] = await Promise.all([get(mUrl), get(tUrl)]);
  const mOk = m.status >= 200 && m.status < 400 && servesVideo(m.html);
  const tOk = t.status >= 200 && t.status < 400 && servesVideo(t.html);
  const frame = framable(m.headers);

  const doc = await get(home);
  const cap = claims(doc.html + m.html);
  const low = (m.html + doc.html).toLowerCase();
  const ads = AD_NETWORKS.filter((n) => low.includes(n));
  const popups = ((m.html.match(/window\.open\s*\(|popunder/gi) || []).length);

  const cell = (ok, r) => (ok ? G('✓ ' + r.ms + 'ms') : R('✗ ' + (r.err || r.status)));
  const ok = mOk && tOk && frame === 'yes';

  console.log('  ' + (shipping ? G('● ') : '  ') + id.padEnd(13) + dns.padEnd(10) +
    cell(mOk, m).padEnd(11 + 9) + cell(tOk, t).padEnd(11 + 9) +
    (frame === 'yes' ? G('yes') : R(String(frame))).padEnd(9 + 9) +
    (ads.length + popups === 0 ? G('clean') : (ads.length ? R : Y)(`${ads.length}n/${popups}p`)).padEnd(7 + 9) +
    D(cap.join(' ') || '—'));

  rows.push({ id, shipping, ok, ms: (m.ms + t.ms) / 2, ads: ads.length, popups, cap, blocked: !mOk && m.status === 0 });
}

console.log('\n' + '═'.repeat(96));
const usable = rows.filter((r) => r.ok).sort((a, b) => (a.ads - b.ads) || (a.popups - b.popups) || (a.ms - b.ms));
console.log(`\n  Usable — serves film AND episode, embeddable (${usable.length}). Cleanest ad load first:`);
usable.forEach((r, i) => console.log(
  `    ${String(i + 1).padStart(2)}. ${r.shipping ? G('●') : ' '} ${r.id.padEnd(12)} ${String(Math.round(r.ms) + 'ms').padEnd(8)} ` +
  `${(r.ads + r.popups === 0 ? 'clean' : `${r.ads} networks, ${r.popups} popups`).padEnd(24)} ${D(r.cap.join(' ') || '—')}`));

const maybe = rows.filter((r) => !r.ok && r.blocked);
if (maybe.length) {
  console.log(`\n  ${Y('Resolves but did not answer from here')} — likely blocked by this network, not dead:`);
  maybe.forEach((r) => console.log(`     ? ${r.shipping ? G('●') : ' '} ${r.id}`));
}
const dead = rows.filter((r) => !r.ok && !r.blocked);
if (dead.length) console.log(`\n  ${R('Not usable')}: ${dead.map((r) => r.id + (r.why ? ` (${r.why})` : '')).join(', ')}`);
console.log();
