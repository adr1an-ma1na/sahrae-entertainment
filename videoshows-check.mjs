/**
 * Video podcasts shelf tests: show ordering by region and episode selection.
 *
 * Run: node --experimental-strip-types videoshows-check.mjs
 */
const { VIDEO_SHOWS, MIN_EPISODE_SECONDS, orderShows, pickEpisodes } = await import('./src/services/videoShows.ts');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

const track = (id, title, duration, uploaded) => ({ id, title, artist: 'channel handle', duration, uploaded, thumbnail: '' });

console.log('\ncurated list');
eq('channel ids are unique', new Set(VIDEO_SHOWS.map((s) => s.channelId)).size, VIDEO_SHOWS.length);
eq('channel ids look like YouTube channel ids', VIDEO_SHOWS.every((s) => /^UC[\w-]{22}$/.test(s.channelId)), true);
eq('every region has shows', ['KE', 'NG', 'ZA', 'GLOBAL'].every((r) => VIDEO_SHOWS.some((s) => s.region === r)), true);

console.log('\norderShows');
const shows = [
  { name: 'G', channelId: 'g', region: 'GLOBAL' },
  { name: 'Z', channelId: 'z', region: 'ZA' },
  { name: 'K', channelId: 'k', region: 'KE' },
  { name: 'N', channelId: 'n', region: 'NG' },
];
eq('own region first, Africa next, global last', orderShows(shows, 'NG').map((s) => s.name), ['N', 'Z', 'K', 'G']);
eq('unknown region: Africa before global', orderShows(shows, 'FR').map((s) => s.name), ['Z', 'K', 'N', 'G']);
eq('does not mutate input', shows.map((s) => s.name), ['G', 'Z', 'K', 'N']);

console.log('\npickEpisodes');
const long = MIN_EPISODE_SECONDS + 60;
const uploads = new Map([
  ['k', [track('old', 'Episode 1', long, 100), track('new', 'Episode 2', long, 200), track('clip', 'Best moment', 120, 300)]],
  ['n', [track('short', 'Big news #shorts', long, 400), track('ep', 'Full episode', long, 50)]],
  ['z', [track('c1', 'Clip', 300, 10)]],
]);
const picked = pickEpisodes(orderShows(shows, 'KE'), uploads);
eq('newest full episode per show, clips and shows without episodes left out', picked.map((e) => [e.show.name, e.track.id]), [['K', 'new'], ['N', 'ep']]);
eq('artist is the show name', picked[0].track.artist, 'K');
eq('marked as podcast', picked.every((e) => e.track.isPodcast === true), true);
eq('empty uploads -> nothing', pickEpisodes(shows, new Map()), []);
eq('exactly 15 minutes counts as an episode', pickEpisodes([shows[2]], new Map([['k', [track('x', 'Ep', MIN_EPISODE_SECONDS, 1)]]])).length, 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
