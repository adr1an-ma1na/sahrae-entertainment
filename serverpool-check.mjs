/**
 * The server pool (src/services/serverPoolRank.ts, src/data/servers.json).
 *
 * The servers are offered in the owner's order (VidLink Pro, then Tier 1, 2
 * and 3). One marked down by the daily check, or failing for viewers, steps
 * out and the rest keep their order; when it recovers it takes its place
 * again. These pin that.
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
const NOW = Date.parse('2026-10-21T12:00:00Z');
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();
const ORDER = ['vidlink', 'vidsrcto', 'autoembed', 'vidsrcsu', 'vidsrcsh', 'vidsrcio', 'vidsrcpm', '2embed', 'multiembed', 'vidjoy'];

console.log('\nthe shipped pool');
eq('is well formed', validPool(pool), true);
eq('films: the owner\'s order, VidLink Pro first', ids(pickServers(pool, 'movie')), ORDER);
eq('series: the same order', ids(pickServers(pool, 'tv')), ORDER);
eq('the order does not change in a browser', ids(pickServers(pool, 'movie', [], Date.now(), undefined, false)), ORDER);
eq('no server id appears twice', new Set(pool.servers.map((s) => s.id)).size, pool.servers.length);

console.log('\nthe quality score (kept for reference; it no longer reorders)');
const base = { id: 'x', name: 'X', movie: 'https://x.test/{id}', tv: 'https://x.test/{id}/{s}/{e}', hosts: ['x.test'], visual: { maxHeight: 1080, mbps: 4, codec: 'h264', adaptive: true }, audio: { channels: 2, languages: 1 }, coverage: 1, events: true, status: 'active' };
const v = (o) => ({ ...base, ...o, visual: { ...base.visual, ...(o.visual || {}) }, audio: { ...base.audio, ...(o.audio || {}) } });
eq('1080p beats 720p however reliable the 720p is', score(v({ visual: { maxHeight: 1080 }, coverage: 0.5, events: false })) > score(v({ visual: { maxHeight: 720 }, coverage: 1, events: true })), true);
eq('H.265 counts as about twice its bitrate', score(v({ visual: { mbps: 2, codec: 'hevc' } })), score(v({ visual: { mbps: 4, codec: 'h264' } })));

console.log('\nwhen a server fails');
const down = { ...pool, servers: pool.servers.map((s) => (s.id === 'vidsrcto' ? { ...s, status: 'down' } : s)) };
eq('a server marked down steps out, the rest keep their order', ids(pickServers(down, 'movie')), ORDER.filter((x) => x !== 'vidsrcto'));
const failing = [{ server_id: 'vidlink', ok: 1, fail: 20, last_ok: ago(60), last_fail: ago(1) }];
eq('a server viewers keep failing on steps out too, and the next leads', ids(pickServers(pool, 'movie', failing, NOW))[0], 'vidsrcto');
eq('...but a success in the last day keeps it', crowdFailing({ server_id: 'x', ok: 1, fail: 20, last_ok: ago(5), last_fail: ago(1) }, NOW), false);
eq('...and a handful of failures is not enough', crowdFailing({ server_id: 'x', ok: 0, fail: 5, last_ok: null, last_fail: ago(1) }, NOW), false);
eq('...nor mostly successes', crowdFailing({ server_id: 'x', ok: 30, fail: 20, last_ok: ago(30), last_fail: ago(1) }, NOW), false);
const allDown = { ...pool, servers: pool.servers.map((s) => ({ ...s, status: 'down' })) };
eq('if every server is marked down, the marks are doubted, not the viewer left with nothing', ids(pickServers(allDown, 'movie')), ORDER);

console.log('\na published pool is only trusted when it is sound');
eq('a URL on someone else\'s host is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], movie: 'https://evil.example/{id}' }] }), false);
eq('plain http is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], movie: 'http://vidlink.pro/movie/{id}' }] }), false);
eq('an unknown status is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], status: 'maybe' }] }), false);
eq('an empty pool is refused', validPool({ ...pool, servers: [] }), false);
eq('junk is refused', [validPool(null), validPool('x'), validPool({})], [false, false, false]);

console.log('\nurls and names, as the owner gave them');
const by = (id) => pool.servers.find((s) => s.id === id);
eq('VidLink Pro film, with its theme colour', fill(by('vidlink').movie, 27205, 1, 1, 'x'), 'https://vidlink.pro/movie/27205?primaryColor=f59e0b');
eq('VidLink Pro episode', fill(by('vidlink').tv, 66732, 5, 1, 'x'), 'https://vidlink.pro/tv/66732/5/1?primaryColor=f59e0b');
eq('AutoEmbed episode, dash-joined', fill(by('autoembed').tv, 1399, 1, 2, 'x'), 'https://autoembed.co/tv/tmdb/1399-1-2');
eq('VidSrc SH episode, by query', fill(by('vidsrcsh').tv, 1399, 1, 2, 'x'), 'https://vidsrc.sh/embed/tv?tmdb=1399&season=1&episode=2');
eq('2Embed episode', fill(by('2embed').tv, 1399, 1, 2, 'x'), 'https://www.2embed.cc/embedtv/1399&s=1&e=2');
eq('MultiEmbed episode', fill(by('multiembed').tv, 1399, 1, 2, 'x'), 'https://multiembed.mov/?video_id=1399&tmdb=1&s=1&e=2');
eq('names as given', pool.servers.map(label), ['VidLink Pro', 'VidSrc.to', 'AutoEmbed', 'VidSrc.su', 'VidSrc SH', 'VidSrc.io', 'VidSrc.pm', '2Embed', 'MultiEmbed', 'VidJoy Pro']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
