/**
 * Made-for-you mix tests.
 *
 * The interesting assertions are the ordering ones. Anyone can concatenate
 * tracks; what makes a mix feel curated rather than shuffled is that the same
 * artist does not keep reappearing, that it stays stable across a day, and that
 * a "discovery" mix genuinely contains things you have not heard.
 *
 * Run: node --experimental-strip-types mixes-check.mjs
 */
import {
  artistAffinity, buildMadeForYou, dayKey, seededShuffle, spaceArtists,
} from './src/services/mixes.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const t = (id, artist, extra = {}) => ({ id, title: id, artist, duration: 200, ...extra });

// ── seededShuffle ──────────────────────────────────────────────────────────
console.log('\nseededShuffle');
const src = Array.from({ length: 30 }, (_, i) => i);
ok('same seed gives the same order',
  JSON.stringify(seededShuffle(src, 7)) === JSON.stringify(seededShuffle(src, 7)));
ok('different seeds differ',
  JSON.stringify(seededShuffle(src, 7)) !== JSON.stringify(seededShuffle(src, 8)));
ok('keeps every element',
  seededShuffle(src, 7).slice().sort((a, b) => a - b).join() === src.join());
ok('does not mutate the input', (seededShuffle(src, 3), src[0] === 0));
ok('empty is safe', seededShuffle([], 1).length === 0);
ok('single element is safe', seededShuffle([9], 1)[0] === 9);
ok('seed 0 does not degenerate', seededShuffle(src, 0).length === 30);

console.log('\ndayKey');
ok('stable within a day',
  dayKey(Date.parse('2026-08-29T01:00:00Z')) === dayKey(Date.parse('2026-08-29T22:00:00Z')));
ok('changes across days',
  dayKey(Date.parse('2026-08-29T12:00:00Z')) !== dayKey(Date.parse('2026-08-30T12:00:00Z')));

// ── artistAffinity ─────────────────────────────────────────────────────────
console.log('\nartistAffinity');
{
  const a = artistAffinity({ liked: [t('1', 'Burna Boy')], recent: [], subscribedArtists: [] });
  ok('a like scores', (a.get('burna boy') || 0) === 3);
}
{
  const a = artistAffinity({ liked: [], recent: [], subscribedArtists: ['Mejja'] });
  ok('a subscription scores', (a.get('mejja') || 0) === 2);
}
{
  const a = artistAffinity({ liked: [t('1', 'A')], recent: [t('2', 'B')], subscribedArtists: [] });
  ok('liking outweighs playing', (a.get('a') || 0) > (a.get('b') || 0));
}
{
  // Recency decay: an artist played recently must outrank one played long ago.
  const recent = [t('1', 'Fresh'),
    ...Array.from({ length: 40 }, (_, i) => t('x' + i, 'Filler')),
    t('99', 'Stale')];
  const a = artistAffinity({ liked: [], recent, subscribedArtists: [] });
  ok('recent plays outweigh old ones', (a.get('fresh') || 0) > (a.get('stale') || 0));
}
{
  const a = artistAffinity({
    liked: [t('1', '  BURNA boy ')], recent: [t('2', 'burna boy')], subscribedArtists: [],
  });
  ok('artist names normalise across case and spacing', a.size === 1);
}
ok('empty signals give an empty map',
  artistAffinity({ liked: [], recent: [], subscribedArtists: [] }).size === 0);
ok('a blank artist is ignored',
  artistAffinity({ liked: [t('1', '   ')], recent: [], subscribedArtists: [] }).size === 0);

// ── spaceArtists — the rule that makes it feel curated ─────────────────────
console.log('\nspaceArtists');
{
  // The failure diverseSample allows: A,B,A,B,A — no adjacent repeat, plainly a loop.
  const input = ['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C'].map((a, i) => t('id' + i, a));
  const out = spaceArtists(input, 3);
  ok('keeps every track', out.length === input.length);
  let worst = Infinity;
  const lastSeen = new Map();
  out.forEach((x, i) => {
    const prev = lastSeen.get(x.artist);
    if (prev !== undefined) worst = Math.min(worst, i - prev);
    lastSeen.set(x.artist, i);
  });
  ok('no artist repeats within the gap', worst >= 3, 'closest repeat was ' + worst);
}
{
  // Degenerate input: one artist only. Must return everything, and terminate.
  const only = Array.from({ length: 5 }, (_, i) => t('s' + i, 'Solo'));
  ok('a single-artist list is returned whole', spaceArtists(only, 3).length === 5);
}
ok('empty input is safe', spaceArtists([], 3).length === 0);

// ── buildMadeForYou ────────────────────────────────────────────────────────
console.log('\nbuildMadeForYou');
const chart = Array.from({ length: 40 }, (_, i) => t('c' + i, 'Chart Artist ' + (i % 12), { uploaded: 1000 + i }));
const liked = Array.from({ length: 12 }, (_, i) => t('l' + i, 'Fav ' + (i % 3)));
const recent = Array.from({ length: 15 }, (_, i) => t('l' + (i % 6), 'Fav ' + (i % 3)));

{
  const byArtist = new Map([['fav 0', Array.from({ length: 10 }, (_, i) => t('f' + i, 'Fav 0', { uploaded: 5000 + i }))]]);
  const mixes = buildMadeForYou({ liked, recent, subscribedArtists: ['Fav 0'] }, { chart, byArtist });

  ok('produces mixes', mixes.length > 0);
  ok('every mix meets the minimum size', mixes.every((m) => m.tracks.length >= 8));
  ok('every mix has a title and subtitle', mixes.every((m) => m.title && m.subtitle));
  ok('mix ids are unique', new Set(mixes.map((m) => m.id)).size === mixes.length);
  ok('includes a supermix', mixes.some((m) => m.id === 'supermix'));
  ok('includes an artist radio', mixes.some((m) => m.id.startsWith('radio-')));
  ok('no mix repeats a track',
    mixes.every((m) => new Set(m.tracks.map((x) => x.id)).size === m.tracks.length));

  const disc = mixes.find((m) => m.id === 'discover');
  ok('Discover exists', !!disc);
  if (disc) {
    const known = new Set([...liked, ...recent].map((x) => x.artist.toLowerCase()));
    ok('  and contains no artist you already play',
      disc.tracks.every((x) => !known.has(x.artist.toLowerCase())));
  }
}
{
  // Stability: same day, same output — otherwise the shelf reshuffles on every
  // render and nothing stays findable.
  const signals = { liked, recent, subscribedArtists: [] };
  const pools = { chart, byArtist: new Map() };
  const at = Date.parse('2026-08-29T09:00:00Z');
  const ids = (ms) => JSON.stringify(ms.map((m) => m.tracks.map((x) => x.id)));

  ok('stable within the same day',
    ids(buildMadeForYou(signals, pools, at)) === ids(buildMadeForYou(signals, pools, at + 3600_000)));
  ok('refreshes on a later day',
    ids(buildMadeForYou(signals, pools, at)) !== ids(buildMadeForYou(signals, pools, at + 3 * 86_400_000)));
}
{
  // A brand-new listener has nothing. Better to show nothing than six thin shelves.
  ok('no signals produces no mixes',
    buildMadeForYou({ liked: [], recent: [], subscribedArtists: [] }, { chart: [], byArtist: new Map() }).length === 0);
}
{
  // Chart data but no history: Discover is the only honest thing to offer.
  const mixes = buildMadeForYou({ liked: [], recent: [], subscribedArtists: [] }, { chart, byArtist: new Map() });
  ok('chart-only offers Discover and nothing pretending to be personal',
    mixes.length > 0 && mixes.every((m) => m.id === 'discover'));
}
{
  // Too little to work with must not yield a 2-track "mix".
  ok('a tiny library yields no mix rather than a stub',
    buildMadeForYou({ liked: [t('1', 'A'), t('2', 'B')], recent: [], subscribedArtists: [] },
      { chart: [], byArtist: new Map() }).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
