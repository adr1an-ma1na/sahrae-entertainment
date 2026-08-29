import type { Track } from './ytmusic.ts';
import { diverseSample, interleaveBlocks } from './recommend.ts';

/**
 * "Made for you" mixes, built from the listener's own library.
 *
 * YouTube Music's home feed is not available to any third party — the Data API
 * exposes no endpoint for it, and reaching YT Music's private endpoints would be
 * both a terms violation and the same fragile dependency the Piped proxies were.
 * But its mixes are, underneath, recommendations computed from what someone
 * listens to. Sahrae has that data: liked music, subscriptions, and play
 * history. So the mixes are generated here instead of fetched.
 *
 * That is not merely a substitute. Computed locally they cannot be rate-limited,
 * cannot break when Google rotates an internal endpoint, and work offline once
 * the pools are loaded.
 *
 * Everything here is pure so the ordering rules — the part that decides whether
 * a mix feels curated or shuffled — can be tested directly.
 */

export interface TasteSignals {
  /** Tracks the listener liked on YouTube. The strongest signal. */
  liked: Track[];
  /** Most-recent-first play history. */
  recent: Track[];
  /** Channel titles the listener subscribes to. */
  subscribedArtists: string[];
}

export interface MixPools {
  /** Regional chart tracks — the discovery pool. */
  chart: Track[];
  /** Uploads keyed by artist name, for artist radios. */
  byArtist: Map<string, Track[]>;
}

export interface Mix {
  id: string;
  title: string;
  subtitle: string;
  tracks: Track[];
}

const key = (s: string): string => (s || '').trim().toLowerCase();
const artistOf = (t: Track): string => key(t.artist);

/** Mixes must be stable across a day, or they reshuffle on every render and
 *  nothing is ever findable again. */
export function dayKey(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

/** Deterministic shuffle — same seed, same order. mulberry32. */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * How much this listener cares about each artist.
 *
 * Liking is deliberate, so it outweighs playing. Play history decays with
 * position — what someone played this week says more about now than what they
 * played six months ago, and a mix built on an equal-weight history is a mix
 * that never notices taste changing. Subscribing is a standing declaration, so
 * it contributes a flat floor rather than scaling.
 */
export function artistAffinity(signals: TasteSignals): Map<string, number> {
  const score = new Map<string, number>();
  const add = (artist: string, n: number) => {
    const k = key(artist);
    if (!k) return;
    score.set(k, (score.get(k) || 0) + n);
  };

  for (const t of signals.liked) add(t.artist, 3);

  // Linear decay over the history window; the oldest entry still counts a
  // little, because a long-standing favourite is not noise.
  const n = Math.max(1, signals.recent.length);
  signals.recent.forEach((t, i) => add(t.artist, 2 * (1 - (i / n) * 0.75)));

  for (const a of signals.subscribedArtists) add(a, 2);

  return score;
}

/**
 * Reorder so the same artist never appears within `gap` tracks.
 *
 * `diverseSample` only prevents ADJACENT repeats, which still allows
 * A,B,A,B,A — technically no repeats, obviously a two-artist loop. Enforcing a
 * real gap is most of what separates a mix that feels curated from a shuffle.
 * Falls back to placing a track early only when nothing else can fill the slot,
 * so this always terminates and never drops material.
 */
export function spaceArtists(tracks: Track[], gap = 3): Track[] {
  const pool = tracks.slice();
  const out: Track[] = [];
  const recentArtists: string[] = [];

  while (pool.length) {
    let idx = pool.findIndex((t) => !recentArtists.includes(artistOf(t)));
    if (idx === -1) idx = 0; // only recently-used artists remain
    const [t] = pool.splice(idx, 1);
    out.push(t);
    recentArtists.push(artistOf(t));
    // The window holds gap-1 artists, not gap. An artist at distance exactly
    // `gap` is acceptable — A B C A satisfies a gap of 3 — and holding `gap`
    // of them rejected that arrangement, so three artists could never be
    // spaced by three even though a valid ordering existed.
    if (recentArtists.length >= gap) recentArtists.shift();
  }
  return out;
}

/** Drop anything already in `known`, by track id. */
function excluding(tracks: Track[], known: Set<string>): Track[] {
  return tracks.filter((t) => t && !known.has(t.id));
}

/** A mix below this is not a mix, it is a handful of songs. */
const MIN_TRACKS = 8;
const TARGET = 40;

/**
 * Build the full set of mixes.
 *
 * Returns only the ones with enough material — an empty or near-empty shelf is
 * worse than an absent one, and a new listener should see two good mixes rather
 * than six thin ones.
 */
export function buildMadeForYou(
  signals: TasteSignals,
  pools: MixPools,
  now = Date.now(),
): Mix[] {
  const seed = dayKey(now);
  const affinity = artistAffinity(signals);
  const mixes: Mix[] = [];

  const familiar = [...signals.liked, ...signals.recent];
  const familiarIds = new Set(familiar.map((t) => t.id));

  // ── Supermix: everything you know, ordered by how much you like the artist ──
  if (familiar.length >= MIN_TRACKS) {
    const ranked = seededShuffle(familiar, seed)
      .sort((a, b) => (affinity.get(artistOf(b)) || 0) - (affinity.get(artistOf(a)) || 0));
    const discovery = excluding(pools.chart, familiarIds);
    mixes.push({
      id: 'supermix',
      title: 'Your Supermix',
      subtitle: 'Everything you listen to, in one run',
      tracks: spaceArtists(
        diverseSample(interleaveBlocks(ranked, seededShuffle(discovery, seed), 4), TARGET, { maxPerArtist: 4 }),
      ),
    });
  }

  // ── On Repeat: what you actually keep going back to ──
  const plays = new Map<string, { t: Track; n: number }>();
  for (const t of signals.recent) {
    const e = plays.get(t.id);
    if (e) e.n += 1; else plays.set(t.id, { t, n: 1 });
  }
  const repeated = [...plays.values()].filter((e) => e.n > 1).sort((a, b) => b.n - a.n).map((e) => e.t);
  if (repeated.length >= MIN_TRACKS) {
    mixes.push({
      id: 'on-repeat',
      title: 'On Repeat',
      subtitle: 'Songs you keep coming back to',
      tracks: spaceArtists(repeated.slice(0, TARGET), 2),
    });
  }

  // ── Artist radios for the three artists you care about most ──
  const topArtists = [...affinity.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([a]) => a)
    .filter((a) => (pools.byArtist.get(a) || []).length + familiar.filter((t) => artistOf(t) === a).length >= MIN_TRACKS)
    .slice(0, 3);

  for (const a of topArtists) {
    const own = [...(pools.byArtist.get(a) || []), ...familiar.filter((t) => artistOf(t) === a)];
    const seen = new Set<string>();
    const unique = own.filter((t) => !seen.has(t.id) && seen.add(t.id));
    // A radio that is only one artist is a discography, not a radio — blend in
    // chart material the listener has not already heard.
    const around = excluding(pools.chart, new Set(unique.map((t) => t.id)));
    const label = own[0]?.artist || a;
    mixes.push({
      id: `radio-${a}`,
      title: `${label} radio`,
      subtitle: 'Built around an artist you play a lot',
      tracks: spaceArtists(
        diverseSample(interleaveBlocks(seededShuffle(unique, seed), seededShuffle(around, seed), 3), TARGET, { maxPerArtist: 6 }),
      ),
    });
  }

  // ── Discover: chart material by artists you have NOT heard ──
  const knownArtists = new Set(affinity.keys());
  const fresh = excluding(pools.chart, familiarIds).filter((t) => !knownArtists.has(artistOf(t)));
  if (fresh.length >= MIN_TRACKS) {
    mixes.push({
      id: 'discover',
      title: 'Discover Mix',
      subtitle: 'Artists you have not played yet',
      tracks: spaceArtists(diverseSample(seededShuffle(fresh, seed), TARGET, { maxPerArtist: 2 })),
    });
  }

  // ── New from artists you follow ──
  const subs = new Set(signals.subscribedArtists.map(key));
  const newest = [...pools.byArtist.entries()]
    .filter(([a]) => subs.has(a))
    .flatMap(([, ts]) => ts)
    .filter((t) => t.uploaded)
    .sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0));
  if (newest.length >= MIN_TRACKS) {
    mixes.push({
      id: 'new-releases',
      title: 'New from your artists',
      subtitle: 'Latest from channels you follow',
      tracks: spaceArtists(newest.slice(0, TARGET), 2),
    });
  }

  return mixes.filter((m) => m.tracks.length >= MIN_TRACKS);
}
