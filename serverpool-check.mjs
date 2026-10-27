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
import { pickServers, score, validPool, crowdFailing, fill, label, notOlder } from './src/services/serverPoolRank.ts';

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
const ORDER = ['vidzee', 'vidfast', 'vidrock', 'vixsrc', 'vidnest', 'vidlove', 'vidlink', 'vidsrcto', 'autoembed', 'vidsrcsu', 'vidsrcsh', '2embed', 'vidsrcio', 'vidsrcpm'];

console.log('\nthe shipped pool');
eq('is well formed', validPool(pool), true);
eq("films: VidZee, VidRock, then the owner's list", ids(pickServers(pool, 'movie')), ORDER);
eq('series: the same order', ids(pickServers(pool, 'tv')), ORDER);
eq('the order does not change in a browser', ids(pickServers(pool, 'movie', [], Date.now(), undefined, false)), ORDER);
eq('no server id appears twice', new Set(pool.servers.map((s) => s.id)).size, pool.servers.length);
eq("fourteen servers: the six measured leads and the owner's eight", pool.servers.length, 14);
eq("the owner's eight are all offered, in the owner's order", ids(pickServers(pool, 'tv')).slice(-8), ['vidlink', 'vidsrcto', 'autoembed', 'vidsrcsu', 'vidsrcsh', '2embed', 'vidsrcio', 'vidsrcpm']);
eq('every server is listed at up to 1080p', pool.servers.every((s) => s.visual.maxHeight >= 1080), true);

console.log('\nthe quality score (kept for reference; it no longer reorders)');
const base = { id: 'x', name: 'X', movie: 'https://x.test/{id}', tv: 'https://x.test/{id}/{s}/{e}', hosts: ['x.test'], visual: { maxHeight: 1080, mbps: 4, codec: 'h264', adaptive: true }, audio: { channels: 2, languages: 1 }, coverage: 1, events: true, status: 'active' };
const v = (o) => ({ ...base, ...o, visual: { ...base.visual, ...(o.visual || {}) }, audio: { ...base.audio, ...(o.audio || {}) } });
eq('1080p beats 720p however reliable the 720p is', score(v({ visual: { maxHeight: 1080 }, coverage: 0.5, events: false })) > score(v({ visual: { maxHeight: 720 }, coverage: 1, events: true })), true);
eq('with the same picture, 5.1 sound wins', score(v({ audio: { channels: 6 } })) > score(v({ audio: { channels: 2 } })), true);

console.log('\nwhen a server fails');
const down = { ...pool, servers: pool.servers.map((s) => (s.id === 'vidrock' ? { ...s, status: 'down' } : s)) };
eq('a server marked down steps out, the rest keep their order', ids(pickServers(down, 'movie')), ORDER.filter((x) => x !== 'vidrock'));
const failing = [{ server_id: 'vidzee', ok: 1, fail: 20, last_ok: ago(60), last_fail: ago(1) }];
eq('a server viewers keep failing on steps out too, and the next leads', ids(pickServers(pool, 'movie', failing, NOW))[0], 'vidfast');
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
eq('VidLink Pro episode (Matlock S2E16)', fill(by('vidlink').tv, 226174, 2, 16, 'x'), 'https://vidlink.pro/tv/226174/2/16?primaryColor=f59e0b');
eq('VidFast film (Dune: Part Two)', fill(by('vidfast').movie, 693134, 1, 1, 'x'), 'https://vidfast.vc/movie/693134?autoPlay=true');
eq('AutoEmbed episode', fill(by('autoembed').tv, 1396, 1, 1, 'x'), 'https://autoembed.co/tv/tmdb/1396-1-1');
eq('VidSrc.pm episode', fill(by('vidsrcpm').tv, 1396, 1, 1, 'x'), 'https://vidsrc.pm/embed/tv?tmdb=1396&season=1&episode=1');
eq('VidNest episode', fill(by('vidnest').tv, 1396, 1, 1, 'x'), 'https://vidnest.fun/tv/1396/1/1');
eq('names', pool.servers.map(label), ['VidZee · 1080p · 5.1', 'VidFast · 4K', 'VidRock · 1080p · sharpest', 'VixSrc · 1080p · subtitles', 'VidNest · 1080p', 'VidLove · 1080p', 'VidLink Pro · 1080p', 'VidSrc.to', 'AutoEmbed', 'VidSrc.su', 'VidSrc.sh', '2Embed', 'VidSrc.io', 'VidSrc.pm']);
eq('VidSrc.to film', fill(by('vidsrcto').movie, 693134, 1, 1, 'x'), 'https://vidsrc.to/embed/movie/693134');
eq('2Embed episode', fill(by('2embed').tv, 1396, 1, 1, 'x'), 'https://www.2embed.cc/embedtv/1396&s=1&e=1');
eq('VidNest is app only', pool.servers.filter((s) => s.web === false).map((s) => s.id), ['vidnest']);

console.log('\nwhich copy of the list wins');
eq('a newer version wins even on the same day', notOlder({ version: 5, updated: '2026-10-25' }, { version: 4, updated: '2026-10-25' }), true);
eq('an older version loses even with a later date', notOlder({ version: 4, updated: '2026-10-26' }, { version: 5, updated: '2026-10-25' }), false);
eq("same version: the daily check's later date wins", notOlder({ version: 5, updated: '2026-10-27' }, { version: 5, updated: '2026-10-25' }), true);
eq('same version, an earlier date loses', notOlder({ version: 5, updated: '2026-10-24' }, { version: 5, updated: '2026-10-25' }), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
