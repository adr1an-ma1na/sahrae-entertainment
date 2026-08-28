import type { Track } from './ytmusic';

/**
 * Deciding whether a YouTube search result is REALLY this podcast episode.
 *
 * "Watch on YouTube" used to keyword-search the episode title and play whatever
 * came back first. Most podcasts never publish episodes to YouTube at all, so
 * the first result was routinely a different show, a clip, or an unrelated music
 * video — the search always returns something, and something was always played.
 *
 * A keyword search cannot be made accurate, so this doesn't try. It scores the
 * candidates and returns nothing unless one clearly IS the episode, which lets
 * the UI say "no video for this episode" instead of showing the wrong one.
 *
 * Runtime is the decisive signal: a podcast episode republished to YouTube has
 * essentially the same length, and nothing else in the results does.
 */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'at',
  'by', 'from', 'is', 'it', 'this', 'that', 'ep', 'episode', 'part', 'pt',
  'podcast', 'show', 'full', 'official', 'video', 'audio', 'hd',
]);

/** Lowercase, strip punctuation, drop filler words and bare numbers-as-noise. */
export function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Share of the episode's distinctive words that appear in the candidate. */
export function tokenOverlap(episodeTitle: string, candidateTitle: string): number {
  const want = new Set(tokenize(episodeTitle));
  if (!want.size) return 0;
  const have = new Set(tokenize(candidateTitle));
  let hit = 0;
  for (const w of want) if (have.has(w)) hit++;
  return hit / want.size;
}

/** 1.0 when the runtimes match exactly, decaying to 0 at a 20% difference. */
export function durationScore(episodeSec: number, candidateSec: number): number {
  if (!episodeSec || !candidateSec) return 0;
  const diff = Math.abs(episodeSec - candidateSec) / episodeSec;
  if (diff > 0.2) return 0;
  return 1 - diff / 0.2;
}

export interface VideoMatch { track: Track; score: number; reason: string }

/**
 * Best genuine match, or null.
 *
 * Deliberately strict — showing nothing is a correct answer here, and showing
 * the wrong video is not. Two ways to qualify:
 *   - runtime lines up AND the title is recognisably the same episode, or
 *   - the title matches almost exactly (a show that titles its uploads
 *     identically), even when YouTube gave us no duration to check.
 */
export function matchEpisodeVideo(
  episode: Pick<Track, 'title' | 'artist' | 'duration'>,
  candidates: Track[],
): VideoMatch | null {
  let best: VideoMatch | null = null;

  for (const c of candidates) {
    const titleScore = tokenOverlap(episode.title, c.title);
    const durScore = durationScore(episode.duration || 0, c.duration || 0);
    // The uploader being the show itself is strong corroboration.
    const showScore = tokenOverlap(episode.artist || '', c.artist || '');

    const durationBacked = durScore > 0 && titleScore >= 0.5;
    // A title-only match is allowed ONLY when there is no runtime to check.
    // If both runtimes are known and they disagree, that disagreement is
    // evidence the video is a different thing — a clip, a compilation, a
    // re-upload — and it outranks however well the titles happen to line up.
    const durationsComparable = (episode.duration || 0) > 0 && (c.duration || 0) > 0;
    const titleAlone = titleScore >= 0.85 && !durationsComparable;
    const showBacked = showScore >= 0.5 && titleScore >= 0.6 && durScore > 0;
    if (!durationBacked && !titleAlone && !showBacked) continue;

    const score = titleScore * 0.5 + durScore * 0.35 + showScore * 0.15;
    const reason = durScore > 0
      ? `runtime and title match${showScore >= 0.5 ? ', same show' : ''}`
      : 'title matches almost exactly';
    if (!best || score > best.score) best = { track: c, score, reason };
  }

  return best;
}
