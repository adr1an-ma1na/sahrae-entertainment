import { Track } from './ytmusic';

/**
 * Podcast follows + per-episode progress (Spotify-style), persisted locally.
 * Positions are stored in MILLISECONDS. The store is keyed by episodeId; state
 * (unplayed / in_progress / played) is DERIVED, never set blindly. A backend can
 * later replace the localStorage layer (last-write-wins on updatedAt).
 */
const FOLLOW_KEY = 'sahrae.podcast.follows.v1';
const PROGRESS_KEY = 'sahrae.podcast.progress.v2';
const COMPLETION_TAIL_MS = 30_000;   // within last 30s = finished
const COMPLETION_RATIO = 0.95;       // or ≥95% watched

export type PodState = 'unplayed' | 'in_progress' | 'played';
export interface EpisodeProgress {
  episodeId: string;
  track: Track;
  positionMs: number;
  durationMs: number;
  state: PodState;
  completed: boolean;
  lastPlayedAt: number;
  updatedAt: number;
}

function read<T>(k: string, fb: T): T { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch { return fb; } }
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

// ── Follows ──
export function getFollows(): Track[] { return read<Track[]>(FOLLOW_KEY, []); }
export function isFollowed(id: string): boolean { return getFollows().some((t) => t.id === id); }
export function toggleFollow(t: Track): Track[] {
  const f = getFollows();
  const next = f.some((x) => x.id === t.id) ? f.filter((x) => x.id !== t.id) : [t, ...f];
  write(FOLLOW_KEY, next);
  return next;
}

// ── Progress ──
function allProgress(): Record<string, EpisodeProgress> { return read<Record<string, EpisodeProgress>>(PROGRESS_KEY, {}); }
function isComplete(posMs: number, durMs: number): boolean {
  return durMs > 0 && (posMs >= durMs - COMPLETION_TAIL_MS || posMs / durMs >= COMPLETION_RATIO);
}
function deriveState(posMs: number, durMs: number, completed: boolean): PodState {
  if (completed) return 'played';
  if (posMs <= 0) return 'unplayed';
  if (isComplete(posMs, durMs)) return 'played';
  return 'in_progress';
}

export function savePodcastProgress(track: Track, positionMs: number, durationMs: number): void {
  if (!track) return;
  const m = allProgress();
  const prev = m[track.id];
  const completed = (prev?.completed ?? false) || isComplete(positionMs, durationMs);
  m[track.id] = {
    episodeId: track.id, track, positionMs, durationMs, completed,
    state: deriveState(positionMs, durationMs, completed),
    lastPlayedAt: Date.now(), updatedAt: Date.now(),
  };
  write(PROGRESS_KEY, m);
}

export function getProgress(id: string): EpisodeProgress | undefined { return allProgress()[id]; }
/** Batched lookup for rendering a whole show's badges in one read. */
export function getMany(ids: string[]): Record<string, EpisodeProgress> {
  const m = allProgress(); const out: Record<string, EpisodeProgress> = {};
  for (const id of ids) if (m[id]) out[id] = m[id];
  return out;
}
/** Continue Listening — in-progress episodes, most recent first. */
export function listInProgress(limit = 20): EpisodeProgress[] {
  return Object.values(allProgress()).filter((p) => p.state === 'in_progress').sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, limit);
}

export function markPlayed(track: Track): void {
  const m = allProgress();
  const dur = m[track.id]?.durationMs || (track.duration ? track.duration * 1000 : 0);
  m[track.id] = { episodeId: track.id, track, positionMs: dur, durationMs: dur, completed: true, state: 'played', lastPlayedAt: Date.now(), updatedAt: Date.now() };
  write(PROGRESS_KEY, m);
}
export function markUnplayed(id: string): void {
  const m = allProgress(); delete m[id]; write(PROGRESS_KEY, m);
}
