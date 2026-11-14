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
import { pickServers, score, validPool, crowdFailing, fill, label, notOlder, leadCount } from './src/services/serverPoolRank.ts';

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
// What played when tested from Kenya on 2026-11-13 first; VidLove, VidSrc.pm and VidSrc.io taken out (not working).
const FILE = ['cinemaos', 'vidzee', 'vidrock', 'vidsrcsu', 'vidsrcto', '2embed', 'vixsrc', 'vidlink', 'autoembed', 'vidfast', 'vidcore', 'vidnest', 'mapple'];
// The daily check marks servers down and up again in the shipped file, so the
// expected order follows their state: the working ones in file order, then the
// ones marked down (still offered).
const isDown = (id) => pool.servers.find((s) => s.id === id)?.status === 'down';
const ORDER = [...FILE.filter((x) => !isDown(x)), ...FILE.filter(isDown)];

console.log('\nthe shipped pool');
eq('is well formed', validPool(pool), true);
eq("films: the 1080p servers that played first, then the rest", ids(pickServers(pool, 'movie')), ORDER);
eq('series: the same order', ids(pickServers(pool, 'tv')), ORDER);
eq('the order does not change in a browser', ids(pickServers(pool, 'movie', [], Date.now(), undefined, false)), ORDER);
eq('no server id appears twice', new Set(pool.servers.map((s) => s.id)).size, pool.servers.length);
eq('thirteen servers', pool.servers.length, 13);
eq("the file keeps the owner's order", ids(pool.servers), FILE);
eq("the owner's servers that still work are all offered, whatever the daily check says", ['vidlink', 'vidsrcto', 'autoembed', 'vidsrcsu', '2embed'].every((id) => ids(pickServers(pool, 'tv')).includes(id)), true);
eq('the ones taken out are recorded with the reason', ['vidlove', 'vidsrcpm', 'vidsrcio'].every((id) => pool.retired.some((r) => r.id === id && r.why.includes('2026-11-13'))), true);
eq('every server is listed at up to 1080p', pool.servers.every((s) => s.visual.maxHeight >= 1080), true);

console.log('\nthe quality score (kept for reference; it no longer reorders)');
const base = { id: 'x', name: 'X', movie: 'https://x.test/{id}', tv: 'https://x.test/{id}/{s}/{e}', hosts: ['x.test'], visual: { maxHeight: 1080, mbps: 4, codec: 'h264', adaptive: true }, audio: { channels: 2, languages: 1 }, coverage: 1, events: true, status: 'active' };
const v = (o) => ({ ...base, ...o, visual: { ...base.visual, ...(o.visual || {}) }, audio: { ...base.audio, ...(o.audio || {}) } });
eq('1080p beats 720p however reliable the 720p is', score(v({ visual: { maxHeight: 1080 }, coverage: 0.5, events: false })) > score(v({ visual: { maxHeight: 720 }, coverage: 1, events: true })), true);
eq('with the same picture, 5.1 sound wins', score(v({ audio: { channels: 6 } })) > score(v({ audio: { channels: 2 } })), true);

console.log('\nwhen a server fails');
const fresh = { ...pool, servers: pool.servers.map((s) => ({ ...s, status: 'active' })) };
const down = { ...fresh, servers: fresh.servers.map((s) => (s.id === 'vidrock' ? { ...s, status: 'down' } : s)) };
eq('a server marked down moves to the back, still offered; the rest keep their order', ids(pickServers(down, 'movie')), [...FILE.filter((x) => x !== 'vidrock'), 'vidrock']);
const failing = [{ server_id: 'cinemaos', ok: 1, fail: 20, last_ok: ago(60), last_fail: ago(1) }];
eq('a server viewers keep failing on moves back too, and the next leads', ids(pickServers(fresh, 'movie', failing, NOW))[0], 'vidzee');
eq('...still offered, at the back', ids(pickServers(fresh, 'movie', failing, NOW)).slice(-1)[0], 'cinemaos');
eq('...but a success in the last day keeps it', crowdFailing({ server_id: 'x', ok: 1, fail: 20, last_ok: ago(5), last_fail: ago(1) }, NOW), false);
eq('...and a handful of failures is not enough', crowdFailing({ server_id: 'x', ok: 0, fail: 5, last_ok: null, last_fail: ago(1) }, NOW), false);
eq('...nor mostly successes', crowdFailing({ server_id: 'x', ok: 30, fail: 20, last_ok: ago(30), last_fail: ago(1) }, NOW), false);
const allDown = { ...pool, servers: pool.servers.map((s) => ({ ...s, status: 'down' })) };
eq('if every server is marked down, all are still offered in the file order', ids(pickServers(allDown, 'movie')), FILE);

console.log('\na published pool is only trusted when it is sound');
eq('a URL on someone else\'s host is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], movie: 'https://evil.example/{id}' }] }), false);
eq('plain http is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], movie: 'http://player.vidzee.wtf/embed/movie/{id}' }] }), false);
eq('an unknown status is refused', validPool({ ...pool, servers: [{ ...pool.servers[0], status: 'maybe' }] }), false);
eq('an empty pool is refused', validPool({ ...pool, servers: [] }), false);
eq('junk is refused', [validPool(null), validPool('x'), validPool({})], [false, false, false]);

console.log("\nthe owner's leads keep their places");
{
  const all = ids(pickServers(fresh, 'movie'));
  eq('all seven working: seven leads', leadCount(pickServers(fresh, 'movie')), 7);
  eq('...in order', all.slice(0, 7), ['cinemaos', 'vidzee', 'vidrock', 'vidsrcsu', 'vidsrcto', '2embed', 'vixsrc']);
  const rockDown = { ...fresh, servers: fresh.servers.map((x) => (x.id === 'vidrock' ? { ...x, status: 'down' } : x)) };
  const list = pickServers(rockDown, 'movie');
  eq('VidRock down: the other six lead, VidRock waits at the back', [leadCount(list), ids(list).slice(1, 3), ids(list).slice(-1)[0]], [6, ['vidzee', 'vidsrcsu'], 'vidrock']);
  eq('no leads: none kept', leadCount([{ id: 'vidfast' }, { id: 'vidzee' }]), 0);
}

console.log('\nurls and names');
const by = (id) => pool.servers.find((s) => s.id === id);
eq('VidLink Pro episode (Matlock S2E16)', fill(by('vidlink').tv, 226174, 2, 16, 'x'), 'https://vidlink.pro/tv/226174/2/16?primaryColor=f59e0b');
eq('VidFast film (Dune: Part Two)', fill(by('vidfast').movie, 693134, 1, 1, 'x'), 'https://vidfast.vc/movie/693134?autoPlay=true');
eq('AutoEmbed episode, at its new address', fill(by('autoembed').tv, 1396, 1, 1, 'x'), 'https://autoembed.me/tv/tmdb/1396-1-1');
eq('VidNest episode', fill(by('vidnest').tv, 1396, 1, 1, 'x'), 'https://vidnest.fun/tv/1396/1/1');
eq('names', pool.servers.map(label), ['CinemaOS · plays at once', 'VidZee · 1080p · 5.1', 'VidRock · 1080p · sharpest', 'VidSrc.su · 1080p', 'VidSrc.to · 1080p', '2Embed · 1080p', 'VixSrc · 1080p · subtitles', 'VidLink Pro · 1080p', 'AutoEmbed', 'VidFast · 4K', 'VidCore', 'VidNest · 1080p', 'Mapple · 4K']);
eq('VidSrc.to film', fill(by('vidsrcto').movie, 693134, 1, 1, 'x'), 'https://vidsrc.to/embed/movie/693134');
eq('2Embed episode', fill(by('2embed').tv, 1396, 1, 1, 'x'), 'https://www.2embed.cc/embedtv/1396&s=1&e=1');
eq('every server is offered on the website too (VidNest since 2026-11-13, owner)', pool.servers.filter((s) => s.web === false).map((s) => s.id), []);
eq('CinemaOS film and episode', [fill(by('cinemaos').movie, 872585, 1, 1, 'x'), fill(by('cinemaos').tv, 1396, 1, 2, 'x')], ['https://cinemaos.tech/player/872585', 'https://cinemaos.tech/player/1396/1/2']);
eq('VidCore episode', fill(by('vidcore').tv, 1396, 1, 1, 'x'), 'https://vidcore.io/tv/1396/1/1');
eq('Mapple episode', fill(by('mapple').tv, 1396, 1, 1, 'x'), 'https://mappletv.uk/embed/tv/1396-1-1');

console.log('\nwhich copy of the list wins');
eq('a newer version wins even on the same day', notOlder({ version: 5, updated: '2026-10-25' }, { version: 4, updated: '2026-10-25' }), true);
eq('an older version loses even with a later date', notOlder({ version: 4, updated: '2026-10-26' }, { version: 5, updated: '2026-10-25' }), false);
eq("same version: the daily check's later date wins", notOlder({ version: 5, updated: '2026-10-27' }, { version: 5, updated: '2026-10-25' }), true);
eq('same version, an earlier date loses', notOlder({ version: 5, updated: '2026-10-24' }, { version: 5, updated: '2026-10-25' }), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
