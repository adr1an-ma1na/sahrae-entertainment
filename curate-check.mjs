/**
 * Sauti's curation (src/services/curate.ts): mixes built from artists, Daily
 * Mix grouping, and matching a song to its YouTube audio.
 *
 * Run: node --experimental-strip-types curate-check.mjs
 */
import { interleave, buildMix, clusterArtists, mixSubtitle, matchScore, bestMatch } from './src/services/curate.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
let n = 0;
const tracks = (artistId, artist, count) => Array.from({ length: count }, (_, i) => ({ id: ++n, title: `${artist} song ${i + 1}`, artist, artistId, duration: 200 }));

console.log('\nmixes from artists');
const fally = tracks(1, 'Fally Ipupa', 10), ferre = tracks(2, 'Ferre Gola', 10), koffi = tracks(3, 'Koffi Olomide', 10);
const mix = interleave([fally, ferre, koffi], 9, 3);
eq('every artist takes turns', mix.slice(0, 3).map((t) => t.artist), ['Fally Ipupa', 'Ferre Gola', 'Koffi Olomide']);
eq('never the same artist twice running', mix.every((t, i) => i === 0 || t.artistId !== mix[i - 1].artistId), true);
eq('at most the cap per artist', Math.max(...[1, 2, 3].map((a) => interleave([fally, ferre, koffi], 30, 4).filter((t) => t.artistId === a).length)), 4);
const dup = [{ id: 900, title: 'Eloko Oyo', artist: 'Fally Ipupa', artistId: 1, duration: 230 }, { id: 901, title: 'Eloko Oyo (Live)', artist: 'Fally Ipupa', artistId: 1, duration: 260 }];
eq('a song once, however many versions', interleave([dup], 5).length, 1);
eq('one artist alone still makes a full list', interleave([fally], 5, 5).length, 5);

console.log('\na Daily Mix');
const daily = buildMix([fally], [ferre, koffi, tracks(4, 'Innoss B', 10), tracks(5, 'Werrason', 10)], 30);
eq('fifty-fifty is not the aim: about 40% familiar', Math.round(daily.filter((t) => t.artistId === 1).length / daily.length * 10) / 10 <= 0.4, true);
eq('discovery and familiar woven, not in blocks', daily.slice(0, 6).some((t) => t.artistId === 1), true);
eq('no artist twice running', daily.every((t, i) => i === 0 || t.artistId !== daily[i - 1].artistId), true);
eq('the subtitle names the artists it plays most', mixSubtitle([...fally.slice(0, 3), ...ferre.slice(0, 2), koffi[0], tracks(9, 'Other', 1)[0]]), 'Fally Ipupa, Ferre Gola, Koffi Olomide and more');

console.log('\ngrouping your artists into Daily Mixes');
const A = (id, name) => ({ id, name });
const picks = [A(1, 'Fally Ipupa'), A(2, 'Ferre Gola'), A(10, 'Burna Boy'), A(11, 'Wizkid'), A(20, 'Hillsong')];
const related = { 1: [2, 3, 4], 2: [1, 3], 10: [11, 12], 11: [10, 13], 20: [21] };
const groups = clusterArtists(picks, related);
eq('related artists share a mix', groups.map((g) => g.map((a) => a.id).sort((x, y) => x - y)), [[1, 2], [10, 11], [20]]);
eq('artists that share a neighbour share a mix', clusterArtists([A(1, 'a'), A(5, 'b')], { 1: [9], 5: [9] }).length, 1);
eq('never more than six mixes', clusterArtists(Array.from({ length: 10 }, (_, i) => A(100 + i, 'x' + i)), {}).length, 6);

console.log('\nmatching a song to its YouTube audio');
const song = { title: 'Eloko Oyo', artist: 'Fally Ipupa', duration: 225 };
eq('the official audio matches', bestMatch(song, [{ id: 'a', title: 'Eloko Oyo', artist: 'Fally Ipupa', duration: 226 }])?.id, 'a');
eq('the video with a longer title still matches', bestMatch(song, [{ id: 'b', title: 'Fally Ipupa - Eloko Oyo (Clip Officiel)', artist: 'Fally Ipupa', duration: 260 }])?.id, 'b');
eq('a different song by the same artist does not', bestMatch(song, [{ id: 'c', title: 'Mayday', artist: 'Fally Ipupa', duration: 210 }]), null);
eq('a karaoke version does not', bestMatch(song, [{ id: 'd', title: 'Eloko Oyo (Karaoke Version)', artist: 'Sing King', duration: 225 }]), null);
eq('a sped-up edit does not', matchScore(song, { id: 'e', title: 'Eloko Oyo sped up', artist: 'Fally Ipupa', duration: 180 }), 0);
eq('the closest of several wins', bestMatch(song, [
  { id: 'x', title: 'Eloko Oyo cover', artist: 'Someone', duration: 225 },
  { id: 'y', title: 'Eloko Oyo', artist: 'Fally Ipupa - Topic', duration: 224 },
  { id: 'z', title: 'Eloko', artist: 'Random', duration: 400 },
])?.id, 'y');
eq('nothing at all, no match', bestMatch(song, []), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
