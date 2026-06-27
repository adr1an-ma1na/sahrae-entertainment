/**
 * Sahrae Music — recommendation primitives (adapted from the Content-Engine spec
 * §1.3.3 / §1.3.5 to the data Sauti actually has).
 *
 * The spec's cosine-similarity engine assumes per-track audio analysis
 * (tempo/energy/danceability/valence). YouTube — our music backend — provides
 * none of that, so we DON'T fabricate feature vectors. Instead the same
 * experience (Song Radio, Daily-Mix-style blends, "More like this") is powered by
 * the real signals we have: YouTube's related-tracks graph + artist-level
 * diversity. These are pure, testable functions with no engine coupling.
 */
import { Track } from './ytmusic';

const artistKey = (t: Track): string => (t.artist || '').trim().toLowerCase();

/**
 * Interleave two ordered lists in blocks (spec §1.3.3 interleaveBlocks): emit
 * `block` familiar, then ~60% of a block of discovery, repeat. Keeps a mix
 * feeling familiar while still surfacing new material.
 */
export function interleaveBlocks<T>(a: T[], b: T[], block = 3): T[] {
  const out: T[] = [];
  let ai = 0, bi = 0;
  const bBlock = Math.max(1, Math.ceil(block * 0.6));
  while (ai < a.length || bi < b.length) {
    for (let i = 0; i < block && ai < a.length; i++) out.push(a[ai++]);
    for (let i = 0; i < bBlock && bi < b.length; i++) out.push(b[bi++]);
  }
  return out;
}

/**
 * Diversity-constrained sampler (spec §1.3.5 diverseSample, keyed on artist NAME
 * since YouTube tracks carry no artistId). De-dupes, caps any single artist at
 * `maxPerArtist`, and avoids two consecutive tracks by the same artist (only
 * allowing a repeat when nothing else is left). Always terminates.
 */
export function diverseSample(
  tracks: Track[],
  count: number,
  opts: { maxPerArtist?: number } = {},
): Track[] {
  const maxPerArtist = opts.maxPerArtist ?? 3;
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const pool: Track[] = [];
  for (const t of tracks) {
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    const a = artistKey(t);
    if ((counts.get(a) || 0) >= maxPerArtist) continue;
    counts.set(a, (counts.get(a) || 0) + 1);
    pool.push(t);
  }
  const result: Track[] = [];
  let lastArtist = '';
  while (result.length < count && pool.length) {
    let idx = pool.findIndex((t) => artistKey(t) !== lastArtist);
    if (idx === -1) idx = 0; // only same-artist tracks remain → allow it
    const [t] = pool.splice(idx, 1);
    result.push(t);
    lastArtist = artistKey(t);
  }
  return result;
}

/**
 * Song Radio (spec §1.3.5): the seed plays first, followed by a diversified run
 * of its related candidates, up to `count` tracks total.
 */
export function songRadio(seed: Track, candidates: Track[], count = 50): Track[] {
  const pool = candidates.filter((t) => t && t.id !== seed.id);
  return [seed, ...diverseSample(pool, Math.max(0, count - 1))];
}

/**
 * Daily-Mix-style blend (spec §1.3.3): familiar tracks (from listening history)
 * interleaved with discovery (related), then diversified by artist.
 */
export function buildMix(familiar: Track[], discovery: Track[], count = 50): Track[] {
  return diverseSample(interleaveBlocks(familiar, discovery, 3), count, { maxPerArtist: 4 });
}
