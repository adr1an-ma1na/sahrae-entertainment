/**
 * Daily server check: marks pool servers down, or back up, in
 * src/data/servers.json. The app reads the published copy of that file, so a
 * dead server leaves every viewer's list within a day and the next best in
 * the pool takes its place (src/services/serverPoolRank.ts).
 *
 * What it can see from here: a host that no longer resolves, refuses, errors,
 * redirects off to another site, or answers with a parked or "not found" page.
 * What it cannot: whether video actually plays, or what a viewer in Kenya
 * gets (these runners are not in Kenya). Those come from viewers' own results
 * (play_proof), which the app weighs separately.
 *
 * A server is marked down after FAILS_TO_DOWN failed days in a row, so one bad
 * morning does not pull it, and back up on its first good one. A server that
 * refuses these runners (401/403/429) is not failing; nothing is changed.
 *
 * Run: node .github/scripts/server-health.mjs [--dry]
 */
import fs from 'node:fs';

const FILE = 'src/data/servers.json';
const FAILS_TO_DOWN = 2;
const dry = process.argv.includes('--dry');
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
// A film and an episode almost every server carries.
const PROBES = [['movie', 27205, 1, 1], ['tv', 1399, 1, 1]];
const PARKED = /(domain (is )?for sale|buy this domain|parked|404 - page not found|page not found|this site can.t be reached|account suspended|coming soon)/i;

const fill = (t, id, s, e) => t.replace(/\{id\}/g, id).replace(/\{s\}/g, s).replace(/\{e\}/g, e).replace(/\{brand\}/g, 'FBBF24');
const ownHost = (host, hosts) => hosts.some((h) => host === h || host.endsWith('.' + h));

async function probe(url, hosts) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(url, {
      redirect: 'follow', signal: c.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Sec-Fetch-Dest': 'iframe', Referer: 'https://adr1an-ma1na.github.io/' },
    });
    const body = (await r.text()).slice(0, 20000);
    const host = new URL(r.url).hostname;
    const title = (body.match(/<title[^>]*>([^<]{0,80})/i) || [])[1] || '';
    // 401/403/429 are a server refusing these data-centre runners (VidSrc.to
    // does this, and plays fine from Kenya), not a dead server: unknown, left
    // to viewers' own results.
    if ([401, 403, 429].includes(r.status)) return { ok: null, why: `refused here (HTTP ${r.status})` };
    if (r.status >= 400) return { ok: false, why: `HTTP ${r.status}` };
    if (!ownHost(host, hosts)) return { ok: false, why: `redirected to ${host}` };
    if (PARKED.test(title)) return { ok: false, why: `"${title.trim()}"` };
    return { ok: true };
  } catch (e) {
    return { ok: false, why: String(e.cause?.code || e.name || e.message).slice(0, 40) };
  } finally { clearTimeout(timer); }
}

const raw = fs.readFileSync(FILE, 'utf8');
const pool = JSON.parse(raw);
const today = new Date().toISOString().slice(0, 10);
let changed = false;

for (const s of pool.servers) {
  const results = [];
  for (const [type, id, se, ep] of PROBES) results.push(await probe(fill(type === 'movie' ? s.movie : s.tv, id, se, ep), s.hosts));
  const up = results.every((r) => r.ok === true);
  const unknown = !up && results.every((r) => r.ok !== false);
  const before = JSON.stringify([s.status, s.failStreak || 0]);
  if (unknown) {
    // Nothing learned: leave the server as it is.
  } else if (up) {
    s.failStreak = 0;
    if (s.status === 'down') { s.status = s.was || 'reserve'; delete s.was; }
  } else {
    s.failStreak = (s.failStreak || 0) + 1;
    if (s.failStreak >= FAILS_TO_DOWN && s.status !== 'down') { s.was = s.status; s.status = 'down'; }
  }
  const after = JSON.stringify([s.status, s.failStreak]);
  if (before !== after) { s.checked = today; changed = true; }
  console.log(`${up ? 'up  ' : unknown ? '??  ' : 'FAIL'} ${s.id.padEnd(14)} ${s.status.padEnd(8)} streak ${s.failStreak}${up ? '' : '  ' + results.filter((r) => r.ok !== true).map((r) => r.why).join('; ')}`);
}

if (changed) {
  pool.updated = today;
  if (!dry) fs.writeFileSync(FILE, JSON.stringify(pool, null, 2) + '\n');
  console.log(dry ? '\nchanges found (dry run, not written)' : '\nservers.json updated');
} else {
  console.log('\nno change');
}
