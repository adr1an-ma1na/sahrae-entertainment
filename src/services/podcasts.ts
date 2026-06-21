import { Track } from './ytmusic';

/**
 * Podcast follows + resume progress, persisted in localStorage.
 * (Episodes/shows are YouTube videos under the hood, so they reuse Track.)
 */
const FOLLOW_KEY = 'sahrae.podcast.follows.v1';
const PROGRESS_KEY = 'sahrae.podcast.progress.v1';

export interface PodProgress { track: Track; position: number; duration: number; ts: number }

function read<T>(k: string, fb: T): T { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch { return fb; } }
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

export function getFollows(): Track[] { return read<Track[]>(FOLLOW_KEY, []); }
export function isFollowed(id: string): boolean { return getFollows().some((t) => t.id === id); }
export function toggleFollow(t: Track): Track[] {
  const f = getFollows();
  const next = f.some((x) => x.id === t.id) ? f.filter((x) => x.id !== t.id) : [t, ...f];
  write(FOLLOW_KEY, next);
  return next;
}

export function savePodcastProgress(track: Track, position: number, duration: number): void {
  const m = read<Record<string, PodProgress>>(PROGRESS_KEY, {});
  m[track.id] = { track, position, duration, ts: Date.now() };
  write(PROGRESS_KEY, m);
}
export function getProgress(id: string): PodProgress | undefined {
  return read<Record<string, PodProgress>>(PROGRESS_KEY, {})[id];
}
/** Started-but-not-finished episodes, most recent first. */
export function getContinue(): PodProgress[] {
  const m = read<Record<string, PodProgress>>(PROGRESS_KEY, {});
  return Object.values(m)
    .filter((p) => p.position > 5 && (!p.duration || p.position < p.duration * 0.97))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 12);
}
