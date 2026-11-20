/**
 * Sahrae's own film player (src/services/cleanStream.ts): which quality it
 * opens on, the label it shows, and the server order it uses.
 *
 * Run: node --experimental-strip-types cleanstream-check.mjs
 */
import fs from 'node:fs';
import { leadCount } from './src/services/serverPoolRank.ts';
import { pickLevel, heightLabel, cleanFirst, relayUrl, pictureRule, ladderFloor } from './src/services/cleanStream.ts';

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
eq('the pool itself is untouched', pool.map((s) => s.id), ['cinemaos', 'vidfast', 'vidlink', 'vidcore', 'mapple', 'vidzee', 'vidrock', 'vidsrcsu', 'vidsrcto', '2embed', 'vixsrc', 'autoembed', 'vidnest']);
// The app's order (PlayerModal): the owner's leads in the owner's order, then the sharpest.
const leads = leadCount(pool);
eq('in the app, the eleven leads keep their places and the rest go sharpest first', [...pool.slice(0, leads), ...cleanFirst(pool.slice(leads))].map((s) => s.id), ['cinemaos', 'vidfast', 'vidlink', 'vidcore', 'mapple', 'vidzee', 'vidrock', 'vidsrcsu', 'vidsrcto', '2embed', 'vixsrc', 'vidnest', 'autoembed']);

console.log('\nthe relay address');
eq('playlist and referer are both carried', relayUrl('https://a.test/x.m3u8?t=1&b=2', 'https://vidrock.to/'),
  'https://localhost/__hlsproxy?u=https%3A%2F%2Fa.test%2Fx.m3u8%3Ft%3D1%26b%3D2&r=https%3A%2F%2Fvidrock.to%2F');
eq('no referer, no r=', relayUrl('https://a.test/x.m3u8', null), 'https://localhost/__hlsproxy?u=https%3A%2F%2Fa.test%2Fx.m3u8');

console.log('\nthe Picture setting: never locked, steps down a rung, never below the floor');
eq('Best: VidRock opens on 1080p, may step down to 720p, no lower', pictureRule(vidrock, 'best'), { start: 1, lock: false, cap: -1, minBitrate: 3_000_000, floor: 720 });
eq('HD: may adapt, never below 720p (3 Mb/s)', pictureRule(vidrock, 'hd'), { start: 1, lock: false, cap: -1, minBitrate: 3_000_000, floor: 720 });
eq('HD on VidLink: floor at its 720p (0.8 Mb/s)', pictureRule(vidlink, 'hd').minBitrate, 800_000);
eq('Data Saver: capped at 480p', pictureRule(vidlink, 'saver'), { start: 2, lock: false, cap: 2, minBitrate: 0, floor: 0 });
eq('a stream with nothing at 720p keeps its best', pictureRule([{ height: 480, bitrate: 1e6 }], 'best'), { start: 0, lock: false, cap: -1, minBitrate: 1e6, floor: 480 });
eq('no renditions: nothing to hold', pictureRule([], 'best').start, -1);

console.log('\nthe ladder (owner, 2026-11-20): 4K > 1440p > 1080p at the lowest; 1440p > 1080p > 720p at the lowest');
eq('floors', [2160, 1440, 1080, 720, 480, 0].map(ladderFloor), [1080, 720, 720, 720, 480, 0]);

console.log('\n4K on a phone: held at 1080p (a 16 Mb/s rendition its screen cannot show)');
const vidfast = [{ height: 2160, bitrate: 16_000_000 }, { height: 1080, bitrate: 6_000_000 }, { height: 720, bitrate: 3_000_000 }, { height: 480, bitrate: 1_300_000 }];
eq('Best on a phone: 1080p at most, 720p at the lowest, never locked', pictureRule(vidfast, 'best'), { start: 1, lock: false, cap: 1, minBitrate: 3_000_000, floor: 720 });

console.log('\non a TV: opens on 1080p (a fast start), climbs to the top, steps down rather than stalling');
eq('VidFast on a TV: free to climb to its 4K, never below 1080p', pictureRule(vidfast, 'best', true), { start: 1, lock: false, cap: -1, minBitrate: 6_000_000, floor: 1080 });
const qhd = [{ height: 1440, bitrate: 9_000_000 }, { height: 1080, bitrate: 5_000_000 }, { height: 720, bitrate: 3_000_000 }, { height: 480, bitrate: 1_000_000 }];
eq('a 1440p stream on a TV: 1440p, 1080p, 720p at the lowest', pictureRule(qhd, 'best', true), { start: 1, lock: false, cap: -1, minBitrate: 3_000_000, floor: 720 });
eq('VidRock on a TV: opens on its 1080p, not locked', pictureRule(vidrock, 'best', true), { start: 1, lock: false, cap: -1, minBitrate: 3_000_000, floor: 720 });
eq('HD and Data Saver are the same on a TV', [pictureRule(vidlink, 'hd', true), pictureRule(vidlink, 'saver', true)], [pictureRule(vidlink, 'hd'), pictureRule(vidlink, 'saver')]);
eq('no renditions on a TV: nothing to hold', pictureRule([], 'best', true).start, -1);

console.log('\nSahrae\'s own player is wired to it');
const cp = fs.readFileSync('src/components/CleanPlayer.tsx', 'utf8');
eq('no rendition is ever locked (a lock cannot step down, so it stalls)', !/currentLevel\s*=\s*rule/.test(cp), true);
eq('the floor and the phone\'s 1080p ceiling are applied', cp.includes('hls.config.minAutoBitrate = rule.minBitrate') && cp.includes('hls.autoLevelCapping = rule.cap'), true);
eq('the floor is measured against what hls.js compares it with (maxBitrate)', cp.includes('bitrate: l.maxBitrate || l.bitrate'), true);
eq('the note when the line dips and when it recovers', cp.includes('Slower connection') && cp.includes('Sharper again'), true);

console.log('\nthe servers\' own players, in the Android apps');
const fo = fs.readFileSync('android-overlay/app/src/main/assets/frame-options.js', 'utf8');
const ma = fs.readFileSync('android-overlay/app/src/main/java/com/sahrae/entertainment/MainActivity.java', 'utf8');
const hc = fs.readFileSync('android-overlay/app/src/main/java/com/sahrae/entertainment/HlsCap.java', 'utf8');
eq('Best edits their menu to the ladder, not 1080p-and-up (which could not step down)', ma.includes('int floor = sQualityFloor == 1080 ? HlsCap.ladderFloor(text) : sQualityFloor;') && hc.includes('return top >= 2000 ? 1080 : 720;'), true);
eq('a player stuck on one size is put on Auto when it stalls, unless the viewer chose that size', fo.includes('h.nextLevel = -1; return (v.__sahraeAuto = true);') && fo.includes("viewerPicked = d.id !== -1;") && fo.includes('if (viewerPicked || v.__sahraeAuto) return false;'), true);
eq('a seek or an advert is not a stall', fo.includes("v.seeking || !(v.currentTime > 3) || film() !== v"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
