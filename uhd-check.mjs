// node --experimental-strip-types uhd-check.mjs
// The server that has a title in 4K starts it (services/uhd.ts); the volume boost and
// the captions button in the player (owner, 2026-11-20).
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { isUhdLabel, crowdUhd, localUhd, keepUhd, uhdKeys, uhdMarker, seriesKey } = await import('./src/services/uhd.ts');

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};

console.log('\nwhat counts as 4K');
eq('2160p, 4K, UHD, 3840x2160', ['2160p', '4K', 'UHD', '3840x2160', '2160p60'].map(isUhdLabel), [true, true, true, true, true]);
eq('not 1080p, 1440p, Auto', ['1080p', '1440p', 'Auto', '720p HD', ''].map(isUhdLabel), [false, false, false, false, false]);

console.log('\nthe shared log');
eq('a marker fits the log\'s server ids', [uhdMarker('vidfast'), uhdMarker('autoembed'), /^[a-z0-9]{2,20}$/.test(uhdMarker('autoembed'))], ['uhdvidfast', 'uhdautoembed', true]);
eq('a series is kept under tv:<id>:0:0 (the log accepts it)', [seriesKey(1399), /^(movie:[0-9]{1,9}|tv:[0-9]{1,9}:[0-9]{1,3}:[0-9]{1,4})$/.test(seriesKey(1399))], ['tv:1399:0:0', true]);
eq('the title and, for a series, the series', [uhdKeys('movie', 1, 'movie:1'), uhdKeys('tv', 7, 'tv:7:1:2')], [['movie:1'], ['tv:7:1:2', 'tv:7:0:0']]);
const rows = [
  { server_id: 'vidfast', ok_count: 9 }, { server_id: 'uhdmapple', ok_count: 1 }, { server_id: 'uhdvidfast', ok_count: 4 },
  { server_id: 'uhdgone', ok_count: 7 }, { server_id: 'uhdvidzee', ok_count: 0 },
];
eq('the servers others saw 4K on, most confirmed first, only those offered', crowdUhd(rows, ['cinemaos', 'vidfast', 'mapple', 'vidzee']), ['vidfast', 'mapple']);
eq('play rows themselves are not 4K reports', crowdUhd([{ server_id: 'vidfast', ok_count: 9 }], ['vidfast']), []);

console.log('\nthis device');
eq('nothing known', localUhd(['movie:693134'], ['vidfast']), null);
eq('seen once: news', keepUhd(['movie:693134'], 'vidfast', 1000), true);
eq('seen again: not news (not reported twice)', keepUhd(['movie:693134'], 'vidfast', 2000), false);
eq('known now', localUhd(['movie:693134'], ['cinemaos', 'vidfast']), 'vidfast');
eq('not when that server is no longer offered', localUhd(['movie:693134'], ['cinemaos']), null);
keepUhd(uhdKeys('tv', 1396, 'tv:1396:1:1'), 'vidfast');
eq('one episode in 4K: the series starts there', localUhd(uhdKeys('tv', 1396, 'tv:1396:3:5'), ['vidfast']), 'vidfast');

console.log('\nwired in');
const pm = readFileSync('src/components/PlayerModal.tsx', 'utf8');
const fo = readFileSync('android-overlay/app/src/main/assets/frame-options.js', 'utf8');
const cp = readFileSync('src/components/CleanPlayer.tsx', 'utf8');
eq('opens on the 4K server it knows (not on Data Saver, not over the viewer\'s own)', pm.includes('savedIdx < 0 && !dataSaverRef.current') && pm.includes("if (uhd && !dataSaverRef.current && !failedServersRef.current.includes(uhd)) return ids.indexOf(uhd);"), true);
eq('learns from any player listing 4K, and tells everyone once', pm.includes('liveChoices?.quality.some((q) => isUhdLabel(q.label))') && pm.includes('if (keepUhd(keys, id)) keys.forEach((k) => reportPlay(k, uhdMarker(id), true));'), true);
eq('the 4K check: apps, big screens, not Data Saver, silent held frame, 20 s in, gone after 25 s', pm.includes("if (!canFrameKick() || !isBigScreen() || !currentMediaType || !currentMediaId) return;") && pm.includes("frame.name = 'sahrae-warm';") && pm.includes('}, 20_000);') && pm.includes('window.setTimeout(finish, 25_000);'), true);
eq('marked · 4K in the server list', pm.includes("${uhdHere === server.id ? ' · 4K' : ''}"), true);
eq('boost inside any server\'s player: gain + limiter, only where it cannot go silent', fo.includes("if (s.indexOf('blob:') === 0) return true;") && fo.includes("why: 'source'") && fo.includes("if (boostCtx.state !== 'running')") && fo.includes('createDynamicsCompressor'), true);
eq('boost answers travel up from nested frames', fo.includes("d.sahrae === 'frame-clock' || d.sahrae === 'boost-state'"), true);
eq('boost in Sahrae\'s own player too', cp.includes('const source = ctx.createMediaElementSource(v), gain = ctx.createGain(), lim = ctx.createDynamicsCompressor();') && pm.includes('boost={boost}'), true);
eq('captions and boost wherever Sahrae reaches the player, the TV too', pm.includes('const trackReach = !playingTrailer && (usingClean || canFrameKick()) && !removedNow;') && pm.includes('{trackReach && !hasLanguages(choices) && (') && pm.includes('{hasLanguages(choices) && (\n'), true);
eq('the website always has a Subtitles button on a server\'s player', pm.includes('const webSubs = !playingTrailer && !trackReach && !removedNow && isPlaying;') && pm.includes('aria-label="Subtitles"'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
