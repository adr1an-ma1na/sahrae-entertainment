/**
 * Sahrae's own film player (src/services/cleanStream.ts): which quality it
 * opens on, the label it shows, and the server order it uses.
 *
 * Run: node --experimental-strip-types cleanstream-check.mjs
 */
import fs from 'node:fs';
import { leadCount } from './src/services/serverPoolRank.ts';
import { pickLevel, heightLabel, cleanFirst, relayUrl, pictureRule } from './src/services/cleanStream.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

// VidRock's menu for Matlock S1E1, measured 2026-10-25, in the order it lists them.
const vidrock = [{ height: 360, bitrate: 800_000 }, { height: 1080, bitrate: 5_000_000 }, { height: 720, bitrate: 3_000_000 }];
const vidlink = [{ height: 1080, bitrate: 1_600_000 }, { height: 720, bitrate: 800_000 }, { height: 480, bitrate: 300_000 }];

console.log('\nthe quality it opens on');
eq('the sharpest rendition, wherever it is listed', pickLevel(vidrock, false), 1);
eq('VidLink: its 1080p, not the 480p it starts on', pickLevel(vidlink, false), 0);
eq('Data Saver: the best at 480p or below', pickLevel(vidlink, true), 2);
eq('Data Saver with nothing that small: the smallest there is', pickLevel([{ height: 1080, bitrate: 5e6 }, { height: 720, bitrate: 3e6 }], true), 1);
eq('the same height twice: the richer one', pickLevel([{ height: 1080, bitrate: 2e6 }, { height: 1080, bitrate: 6e6 }], false), 1);
eq('no heights: by bitrate', pickLevel([{ height: 0, bitrate: 1e6 }, { height: 0, bitrate: 4e6 }], false), 1);
eq('a single rendition (VidZee)', pickLevel([{ height: 1080, bitrate: 3e6 }], false), 0);
eq('nothing to pick', pickLevel([], false), -1);

console.log('\nthe badge says what is on screen');
eq('1080 rows', heightLabel(1080), '1080p');
eq('a cropped 1080p film (1920x800)', heightLabel(1036), '1080p');
eq('720', heightLabel(720), '720p');
eq('480 is shown as 480p, not dressed up', heightLabel(480), '480p');
eq('4K', heightLabel(2160), '4K');

console.log('\nserver order in Sahrae\'s player: clearest first');
const pool = JSON.parse(fs.readFileSync('src/data/servers.json', 'utf8')).servers;
eq('sharpest first, when nothing else orders them: VidFast, VidRock, VixSrc, VidZee, VidNest', cleanFirst(pool).map((s) => s.id).slice(0, 5), ['vidfast', 'vidrock', 'vixsrc', 'vidzee', 'vidnest']);
eq('the pool itself is untouched', pool.map((s) => s.id), ['vidzee', 'vidrock', 'vidsrcsu', 'vidsrcto', '2embed', 'vixsrc', 'vidlink', 'vidsrcsh', 'autoembed', 'vidfast', 'vidnest']);
// The app's order (PlayerModal): the owner's leads in the owner's order, then the sharpest.
const leads = leadCount(pool);
eq('in the app, the six leads keep their places and the rest go sharpest first', [...pool.slice(0, leads), ...cleanFirst(pool.slice(leads))].map((s) => s.id), ['vidzee', 'vidrock', 'vidsrcsu', 'vidsrcto', '2embed', 'vixsrc', 'vidfast', 'vidnest', 'vidlink', 'vidsrcsh', 'autoembed']);

console.log('\nthe relay address');
eq('playlist and referer are both carried', relayUrl('https://a.test/x.m3u8?t=1&b=2', 'https://vidrock.to/'),
  'https://localhost/__hlsproxy?u=https%3A%2F%2Fa.test%2Fx.m3u8%3Ft%3D1%26b%3D2&r=https%3A%2F%2Fvidrock.to%2F');
eq('no referer, no r=', relayUrl('https://a.test/x.m3u8', null), 'https://localhost/__hlsproxy?u=https%3A%2F%2Fa.test%2Fx.m3u8');

console.log('\nthe Picture setting is held');
eq('Best: VidRock opens on 1080p and is locked there', pictureRule(vidrock, 'best'), { start: 1, lock: true, cap: -1, minBitrate: 0 });
eq('HD: may adapt, never below 720p (3 Mb/s)', pictureRule(vidrock, 'hd'), { start: 1, lock: false, cap: -1, minBitrate: 3_000_000 });
eq('HD on VidLink: floor at its 720p (0.8 Mb/s)', pictureRule(vidlink, 'hd').minBitrate, 800_000);
eq('Data Saver: capped at 480p', pictureRule(vidlink, 'saver'), { start: 2, lock: false, cap: 2, minBitrate: 0 });
eq('HD with nothing at 720p: no floor', pictureRule([{ height: 480, bitrate: 1e6 }], 'hd').minBitrate, 0);
eq('no renditions: nothing to hold', pictureRule([], 'best').start, -1);

console.log('\n4K: held back on phones and TVs (a 16 Mb/s rendition stalls a home line)');
const vidfast = [{ height: 2160, bitrate: 16_000_000 }, { height: 1080, bitrate: 6_000_000 }, { height: 720, bitrate: 3_000_000 }, { height: 480, bitrate: 1_300_000 }];
eq('Best on a phone: locked on 1080p, not the 16 Mb/s 4K', pictureRule(vidfast, 'best'), { start: 1, lock: true, cap: -1, minBitrate: 0 });
eq('Best with no 4K on offer: unchanged (top, locked)', pictureRule(vidrock, 'best'), { start: 1, lock: true, cap: -1, minBitrate: 0 });

console.log('\non a TV: Best opens sharp, may step down, never climbs past 1080p');
eq('VidFast on a TV: opens on 1080p, not locked, capped there', pictureRule(vidfast, 'best', true), { start: 1, lock: false, cap: 1, minBitrate: 0 });
eq('VidRock on a TV: opens on its 1080p, not locked', pictureRule(vidrock, 'best', true), { start: 1, lock: false, cap: 1, minBitrate: 0 });
eq('HD and Data Saver are the same on a TV', [pictureRule(vidlink, 'hd', true), pictureRule(vidlink, 'saver', true)], [pictureRule(vidlink, 'hd'), pictureRule(vidlink, 'saver')]);
eq('no renditions on a TV: nothing to hold', pictureRule([], 'best', true).start, -1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
