/**
 * Sauti catalogue rules: Daily Mixes never repeat across days, Release Radar
 * stays within 100 recent songs in the listener's genres, and genre taste is
 * learned from what is played.
 *
 * Run: node --experimental-strip-types musiccatalog-check.mjs
 */
import {
  buildDailyMixes, recordServed, buildReleaseRadar, topGenres, addTaste, genresOf,
  emptyIndex, indexPool, NO_REPEAT_DAYS, RADAR_MAX, rankArtists, leadArtist, isSong,
} from './src/services/musicCatalog.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 11, 12);
const song = (g, i, extra = {}) => ({ id: `${g}-${i}`, title: `${g} song ${i}`, artist: `${g} artist ${i % 40}`, duration: 200, ...extra });
const pool = (g, n) => Array.from({ length: n }, (_, i) => song(g, i));

console.log('\nDaily Mixes');
{
  // A deep pool: 30 days x 50 songs fit, so nothing may repeat in 30 days.
  const pools = new Map([['afrobeats', pool('afrobeats', 1600)]]);
  const index = emptyIndex(); indexPool(index, 'afrobeats', pools.get('afrobeats'));
  let history = {};
  const seenOnDay = new Map();
  let repeat = null;
  const day0 = Math.floor(NOW / DAY);
  for (let d = 0; d < NO_REPEAT_DAYS; d++) {
    const mixes = buildDailyMixes({ genres: ['afrobeats'], pools, familiar: [], index, history, day: day0 + d });
    for (const t of mixes.flatMap((m) => m.tracks)) {
      if (seenOnDay.has(t.id) && !repeat) repeat = `${t.id} on day ${seenOnDay.get(t.id)} and ${d}`;
      seenOnDay.set(t.id, d);
    }
    history = recordServed(history, day0 + d, mixes);
  }
  ok(`no song repeats across ${NO_REPEAT_DAYS} days when the pool allows`, !repeat, repeat || '');
}
{
  // A shallow pool: older songs may return, but never yesterday's.
  const pools = new Map([['bongo', pool('bongo', 130)]]);
  const index = emptyIndex(); indexPool(index, 'bongo', pools.get('bongo'));
  let history = {}; let prev = new Set(); let clash = null; let sizes = [];
  const day0 = Math.floor(NOW / DAY);
  for (let d = 0; d < 10; d++) {
    const mixes = buildDailyMixes({ genres: ['bongo'], pools, familiar: [], index, history, day: day0 + d });
    const ids = mixes.flatMap((m) => m.tracks.map((t) => t.id));
    sizes.push(ids.length);
    for (const id of ids) if (prev.has(id) && !clash) clash = `${id} on consecutive days (${d - 1}, ${d})`;
    prev = new Set(ids);
    history = recordServed(history, day0 + d, mixes);
  }
  ok("yesterday's songs never return, even in a small genre", !clash, clash || '');
  ok('a small genre still gets a full mix every day', sizes.every((n) => n >= 40), sizes.join(','));
}
{
  const g = ['afrobeats', 'amapiano', 'bongo', 'kenyan', 'hip-hop', 'rnb', 'pop'];
  const pools = new Map(g.map((x) => [x, pool(x, 300)]));
  const index = emptyIndex(); for (const [x, ts] of pools) indexPool(index, x, ts);
  // Liked songs that are NOT in the catalogue, attributed to the genre by artist.
  const familiar = Array.from({ length: 60 }, (_, i) => ({ id: `liked-${i}`, title: `liked ${i}`, artist: `afrobeats artist ${i % 40}`, duration: 210 }));
  const mixes = buildDailyMixes({ genres: g, pools, familiar, index, history: {}, day: 100 });
  const all = mixes.flatMap((m) => m.tracks.map((t) => t.id));
  ok('at most six Daily Mixes', mixes.length === 6, String(mixes.length));
  ok('no song in two mixes on the same day', new Set(all).size === all.length);
  ok('each mix is one of the listener\'s genres, in order', mixes.map((m) => m.genre).join() === g.slice(0, 6).join());
  ok('mixes are titled Daily Mix 1..6', mixes.every((m, i) => m.title === `Daily Mix ${i + 1}`));
  const afro = mixes[0];
  const famIds = new Set(familiar.map((t) => t.id));
  const famShare = afro.tracks.filter((t) => famIds.has(t.id)).length / afro.tracks.length;
  ok('familiar songs are at most 30% of a mix', famShare <= 0.3 + 1e-9, famShare.toFixed(2));
  // Same artist never within 3 songs (spaceArtists gap 3) where avoidable.
  const close = afro.tracks.some((t, i) => afro.tracks.slice(Math.max(0, i - 2), i).some((u) => u.artist === t.artist));
  ok('the same artist is spaced out', !close);
  const again = buildDailyMixes({ genres: g, pools, familiar, index, history: {}, day: 100 });
  ok('a day\'s mixes are stable (same day, same mixes)', again.map((m) => m.tracks.map((t) => t.id).join()).join() === mixes.map((m) => m.tracks.map((t) => t.id).join()).join());
}

{
  const pools = new Map([['pop', pool('pop', 400)]]);
  const index = emptyIndex(); indexPool(index, 'pop', pools.get('pop'));
  const first = buildDailyMixes({ genres: ['pop'], pools, familiar: [], index, history: {}, day: 500 });
  let h = recordServed({}, 500, first);
  const rebuilt = buildDailyMixes({ genres: ['pop'], pools, familiar: [], index, history: h, day: 500, size: 30 });
  h = recordServed(h, 500, rebuilt);
  const morning = first.flatMap((m) => m.tracks.map((t) => t.id));
  ok('a same-day rebuild keeps the morning songs on record', morning.every((id) => h[500].includes(id)));
}

console.log('\nRelease Radar');
{
  const fresh = (g, i, ageDays) => song(g, `n${i}`, { uploaded: NOW - ageDays * DAY });
  const pools = new Map([
    ['afrobeats', [...Array.from({ length: 90 }, (_, i) => fresh('afrobeats', i, i % 40)), ...pool('afrobeats', 50)]],
    ['amapiano', Array.from({ length: 90 }, (_, i) => fresh('amapiano', i, i % 35))],
    ['rock', Array.from({ length: 50 }, (_, i) => fresh('rock', i, 2))],
  ]);
  const index = emptyIndex(); for (const [x, ts] of pools) indexPool(index, x, ts);
  const radar = buildReleaseRadar({ genres: ['afrobeats', 'amapiano'], pools, uploads: [], index, favouriteArtists: new Set(), now: NOW });
  ok(`never more than ${RADAR_MAX} songs`, radar.length <= RADAR_MAX, String(radar.length));
  ok('fills up to the cap when there is enough new music', radar.length === RADAR_MAX, String(radar.length));
  ok('only the last four weeks', radar.every((t) => NOW - t.uploaded <= 28 * DAY));
  ok('only the listener\'s genres', radar.every((t) => !t.id.startsWith('rock')));
  const weeks = radar.map((t) => Math.floor((NOW - t.uploaded) / (7 * DAY)));
  ok('newest week first', weeks.every((w, i) => i === 0 || w >= weeks[i - 1]));
  ok('no duplicates', new Set(radar.map((t) => t.id)).size === radar.length);
}

console.log('\nGenre taste');
{
  let taste = {};
  taste = addTaste(taste, 'amapiano', 5, NOW - 60 * DAY);
  taste = addTaste(taste, 'bongo', 2, NOW);
  ok('recent listening outranks old listening', topGenres(taste, 1, NOW)[0] === 'bongo');
  const six = topGenres(taste, 6, NOW);
  ok('a thin history is rounded out to six genres', six.length === 6 && six[0] === 'bongo');
  ok('a brand-new listener starts on the region\'s sounds', topGenres({}, 3, NOW).join() === 'afrobeats,amapiano,kenyan');

  const index = emptyIndex();
  indexPool(index, 'amapiano', [song('x', 1, { artist: 'Kabza De Small' }), song('x', 2, { artist: 'Kabza De Small' })]);
  indexPool(index, 'afro-house', [song('y', 1, { artist: 'Kabza De Small' })]);
  ok('a catalogue song counts for its own genre', genresOf({ id: 'x-1', artist: 'Kabza De Small' }, index)[0].id === 'amapiano');
  const spread = genresOf({ id: 'unknown', artist: 'kabza de small' }, index);
  ok('an unknown song counts by its artist\'s genres', spread.length === 2 && Math.abs(spread.find((g) => g.id === 'amapiano').weight - 2 / 3) < 1e-9);
}

console.log('\nWhat counts as a song');
{
  const s = (title, duration = 200) => isSong({ id: 'x', title, artist: 'A', duration });
  ok('a normal song', s('Harmonize - Kudos (Official Video)'));
  ok('a hashtag vlog is not', !s('#Harmonize #Uk #31Album'));
  ok('"24hrs in Nairobi" is not', !s('24hrs Harmonize In Nairobi'));
  ok('a 2-hour mix is not', !s('Amapiano Mix 2026', 7200));
  ok('a short clip is not', !s('Kudos snippet', 30));
}

console.log('\nLead artist');
{
  ok('first of a comma list', leadArtist('DJ Maphorisa, DJ Tunez, Wizkid') === 'DJ Maphorisa');
  ok('ft. and &', leadArtist('Harmonize ft. Mbosso') === 'Harmonize' && leadArtist('Harmonize & Mbosso') === 'Harmonize');
  ok('a plain name is untouched', leadArtist('Burna Boy') === 'Burna Boy');
}

console.log('\nArtists');
{
  const ts = [
    ...Array.from({ length: 5 }, (_, i) => song('a', i, { artist: 'Burna Boy', channelId: 'UCburna' })),
    ...Array.from({ length: 2 }, (_, i) => song('b', i, { artist: 'Tems', channelId: 'UCtems' })),
    song('c', 1, { artist: 'Burna Boy', channelId: 'UClabel' }),
  ];
  const a = rankArtists(ts, 10);
  ok('most-present artists first', a[0].name === 'Burna Boy' && a[1].name === 'Tems');
  ok('an artist maps to the channel that uploads most of their songs', a[0].id === 'UCburna');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
