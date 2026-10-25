/**
 * The server pool (src/services/serverPoolRank.ts, src/data/servers.json).
 *
 * The servers are offered in the pool's order: best picture and sound first
 * (measured 2026-10-22 on Matlock and Dune: Part Two). One marked down by the
 * daily check, or failing for viewers, steps out and the rest keep their
 * order; when it recovers it takes its place again. These pin that.
 *
 * Run: node --experimental-strip-types serverpool-check.mjs
 */
import fs from 'node:fs';
import { pickServers, score, validPool, crowdFailing, fill, label } from './src/services/serverPoolRank.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
const pool = JSON.parse(fs.readFileSync('src/data/servers.json', 'utf8'));
const ids = (list) => list.map((s) => s.id);
const NOW = Date.parse('2026-10-22T12:00:00Z');
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();
const ORDER = ['vidzee', 'vidrock', 'viduki', 'vidlink'];

console.log('\nthe shipped pool');
eq('is well formed', validPool(pool), true);
eq('films: best picture and sound first, VidZee leads', ids(pickServers(pool, 'movie')), ORDER);
eq('series: the same order', ids(pickServers(pool, 'tv')), ORDER);
eq('the order does not change in a browser', ids(pickServers(pool, 'movie', [], Date.now(), undefined, false)), ORDER);
eq('no server id appears twice', new Set(pool.servers.map((s) => s.id)).size, pool.servers.length);
eq('the first two carry 5.1 surround', pool.servers.slice(0, 2).map((s) => s.audio.channels), [6, 6]);
eq('every server is at least 1080p', pool.servers.every((s) => s.visual.maxHeight >= 1080), true);

console.log('\nthe quality score (kept for reference; it no longer reorders)');
const base = { id: 'x', name: 'X', movie: 'https://x.test/{id}', tv: 'https://x.test/{id}/{s}/{e}', hosts: ['x.test'], visual: { maxHeight: 1080, mbps: 4, codec: 'h264', adaptive: true }, audio: { channels: 2, languages: 1 }, coverage: 1, events: true, status: 'active' };
const v = (o) => ({ ...base, ...o, visual: { ...base.visual, ...(o.visual || {}) }, audio: { ...base.audio, ...(o.audio || {}) } });
eq('1080p beats 720p however reliable the 720p is', score(v({ visual: { maxHeight: 1080 }, coverage: 0.5, events: false })) > score(v({ visual: { maxHeight: 720 }, coverage: 1, events: true })), true);
eq('with the same picture, 5.1 sound wins', score(v({ audio: { channels: 6 } })) > score(v({ audio: { channels: 2 } })), true);

console.log('\nwhen a server fails');
const down = { ...pool, servers: pool.servers.map((s) => (s.id === 'vidrock' ? { ...s, status: 'down' } : s)) };
eq('a server marked down steps out, the rest keep their order', ids(pickServers(down, 'movie')), ORDER.filter((x) => x !== 'vidrock'));
const failing = [{ server_id: 'vidzee', ok: 1, fail: 20, last_ok: ago(60), last_fail: ago(1) }];
eq('a server viewers keep failing on steps out too, and the next leads', ids(pickServers(pool, 'movie', failing, NOW))[0], 'vidrock');
eq('...but a success in the last day keeps it', crowdFailing({ server_id: 'x', ok: 1, fail: 20, last_ok: ago(5), last_fail: ago(1) }, NOW), false);
eq('...and a handful of failures is not enough', crowdFailing({ server_id: 'x', ok: 0, fail: 5, last_ok: null, last_fail: ago(1) }, NOW), false);
eq('...nor mostly successes', crowdFailing({ server_id: 'x', ok: 30, fail: 20, last_ok: ago(30), last_fail: ago(1) }, NOW), false);
const allDown = { ...pool, servers: pool.servers.map((s) => ({ ...s, status: 'down' })) };
eq('if every server is marked down, the marks are doubted, not the viewer left with nothing', ids(pickServers(allDown, 'movie')), ORDER);

console.log('\na published pool is only trusted when it is sound');
eq('a URL on someone else\'s host is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], movie: 'https://evil.example/{id}' }] }), false);
eq('plain http is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], movie: 'http://player.vidzee.wtf/embed/movie/{id}' }] }), false);
eq('an unknown status is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], status: 'maybe' }] }), false);
eq('an empty pool is refused', validPool({ ...pool, servers: [] }), false);
eq('junk is refused', [validPool(null), validPool('x'), validPool({})], [false, false, false]);

console.log('\nurls and names');
const by = (id) => pool.servers.find((s) => s.id === id);
eq('VidZee episode (Matlock S2E16)', fill(by('vidzee').tv, 226174, 2, 16, 'x'), 'https://player.vidzee.wtf/embed/tv/226174/2/16');
eq('VidRock film (Dune: Part Two)', fill(by('vidrock').movie, 693134, 1, 1, 'x'), 'https://vidrock.to/embed/movie/693134');
eq('Viduki episode', fill(by('viduki').tv, 226174, 1, 1, 'x'), 'https://vidsrc.wtf/api/1/tv/?id=226174&s=1&e=1');
eq('VidLink Pro keeps its theme colour', fill(by('vidlink').tv, 226174, 2, 16, 'x'), 'https://vidlink.pro/tv/226174/2/16?primaryColor=f59e0b');
eq('names say the picture and sound, honestly', pool.servers.map(label), ['VidZee · 1080p · 5.1', 'VidRock · 1080p · sharpest', 'Viduki · 1080p', 'VidLink Pro · up to 1080p']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
