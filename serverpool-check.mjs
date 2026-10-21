/**
 * The server pool (src/services/serverPoolRank.ts, src/data/servers.json).
 *
 * Six servers are shown: the best in the pool by visual quality, then audio,
 * then reliability. When one goes down, by the daily check or by viewers
 * failing on it, the next best takes its place. These pin that.
 *
 * Run: node --experimental-strip-types serverpool-check.mjs
 */
import fs from 'node:fs';
import { pickServers, score, validPool, crowdFailing, fill, label, ACTIVE_COUNT } from './src/services/serverPoolRank.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
const pool = JSON.parse(fs.readFileSync('src/data/servers.json', 'utf8'));
const ids = (list) => list.map((s) => s.id);
const NOW = Date.parse('2026-10-21T12:00:00Z');
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();

console.log('\nthe shipped pool');
eq('is well formed', validPool(pool), true);
eq('offers six', pickServers(pool, 'movie').length, ACTIVE_COUNT);
eq('films: sharpest picture first', ids(pickServers(pool, 'movie')), ['vidrock', 'vidzee', 'vidlink', 'viduki', 'vidsrcto', '2embed']);
eq('series: servers that can start the next episode lead', ids(pickServers(pool, 'tv')).slice(0, 2), ['vidzee', 'vidlink']);
eq('no server id appears twice', new Set(pool.servers.map((s) => s.id)).size, pool.servers.length);

console.log('\nthe ranking is visual, then audio, then reliability');
const base = { id: 'x', name: 'X', movie: 'https://x.test/{id}', tv: 'https://x.test/{id}/{s}/{e}', hosts: ['x.test'], visual: { maxHeight: 1080, mbps: 4, codec: 'h264', adaptive: true }, audio: { channels: 2, languages: 1 }, coverage: 1, events: true, status: 'active' };
const v = (o) => ({ ...base, ...o, visual: { ...base.visual, ...(o.visual || {}) }, audio: { ...base.audio, ...(o.audio || {}) } });
eq('1080p beats 720p however reliable the 720p is', score(v({ visual: { maxHeight: 1080 }, coverage: 0.5, events: false })) > score(v({ visual: { maxHeight: 720 }, coverage: 1, events: true })), true);
eq('with the same picture, 5.1 sound wins', score(v({ audio: { channels: 6 } })) > score(v({ audio: { channels: 2 } })), true);
eq('with the same picture and sound, the more reliable wins', score(v({ coverage: 1 })) > score(v({ coverage: 0.6 })), true);
eq('H.265 counts as about twice its bitrate', score(v({ visual: { mbps: 2, codec: 'hevc' } })), score(v({ visual: { mbps: 4, codec: 'h264' } })));
eq('an unmeasured server is never ranked on guesswork above a measured one', score(v({ visual: { mbps: null, codec: null } })) < score(v({ visual: { mbps: 4 } })), true);

console.log('\nreplacement');
const down = { ...pool, servers: pool.servers.map((s) => (s.id === 'vidzee' ? { ...s, status: 'down' } : s)) };
eq('a server marked down leaves the six', ids(pickServers(down, 'movie')).includes('vidzee'), false);
eq('and the best reserve takes its place', ids(pickServers(down, 'movie')), ['vidrock', 'vidlink', 'viduki', 'vidsrcto', '2embed', 'vidsrcme']);
const failing = [{ server_id: 'vidrock', ok: 1, fail: 20, last_ok: ago(60), last_fail: ago(1) }];
eq('a server viewers keep failing on leaves too', ids(pickServers(pool, 'movie', failing, NOW))[0], 'vidzee');
eq('...but a success in the last day keeps it', crowdFailing({ server_id: 'x', ok: 1, fail: 20, last_ok: ago(5), last_fail: ago(1) }, NOW), false);
eq('...and a handful of failures is not enough', crowdFailing({ server_id: 'x', ok: 0, fail: 5, last_ok: null, last_fail: ago(1) }, NOW), false);
eq('...nor mostly successes', crowdFailing({ server_id: 'x', ok: 30, fail: 20, last_ok: ago(30), last_fail: ago(1) }, NOW), false);
const allDown = { ...pool, servers: pool.servers.map((s) => ({ ...s, status: 'down' })) };
eq('if every server is marked down, the marks are doubted, not the viewer left with nothing', pickServers(allDown, 'movie').length, ACTIVE_COUNT);

console.log('\na published pool is only trusted when it is sound');
eq('a URL on someone else\'s host is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], movie: 'https://evil.example/{id}' }] }), false);
eq('plain http is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], movie: 'http://vidrock.to/embed/movie/{id}' }] }), false);
eq('an unknown status is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], status: 'maybe' }] }), false);
eq('an empty pool is refused', validPool({ ...pool, servers: [] }), false);
eq('junk is refused', [validPool(null), validPool('x'), validPool({})], [false, false, false]);

console.log('\nurls and names');
eq('a film URL', fill(pool.servers[0].movie, 27205, 1, 1, 'FBBF24'), 'https://vidrock.to/embed/movie/27205');
eq('an episode URL, with the theme colour', fill(pool.servers.find((s) => s.id === 'vidlink').tv, 66732, 5, 1, 'FBBF24'),
  'https://vidlink.pro/tv/66732/5/1?primaryColor=FBBF24&autoplay=true&title=true&nextbutton=true');
eq('names say the picture, and languages when there are several', [label(pool.servers[0]), label(pool.servers[1]), label(pool.servers[4])],
  ['VidRock · 1080p', 'VidZee · 1080p · 4 languages', 'VidSrc.to (backup)']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
