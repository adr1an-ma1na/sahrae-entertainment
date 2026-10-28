import { useState, useEffect } from 'react';
import { MediaItem } from '../services/tmdb';
import { useAuth } from './useAuth';

/**
 * Continue watching: what was opened, on which server, and how far in.
 *
 * Kept on the device and carried between devices by the account sync
 * (services/cloudSync.ts, keyed to the Sahrae account). It used to be mirrored
 * to Firestore under an ANONYMOUS Firebase sign-in instead: a different identity
 * on every install or cleared WebView, whose empty list then replaced the one
 * on the device. That is how "my continue watching keeps emptying" happened
 * (2026-10-28), and why it no longer exists.
 */

export interface WatchProgress {
  mediaId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  timestamp: number; // Date.now()
  item: MediaItem;
  /** The server it was playing on, so the title reopens there. */
  server?: string;
  /** Seconds in, and the length, where the player reports its clock. */
  position?: number;
  duration?: number;
}

/** Continue-watching history stored on-device, scoped per user + profile. */
function scopeKey(uid?: string, profileId?: string): string {
  if (uid && profileId) return `${uid}_${profileId}`;
  if (uid) return uid;
  return 'local';
}
export const WATCH_PROGRESS_PREFIX = 'sahrae_watch_progress_';
const storageKey = (scope: string) => `${WATCH_PROGRESS_PREFIX}${scope}`;
const MAX_ENTRIES = 30;

/** Fired after progress is saved, so every holder of this hook re-reads it. */
const PROGRESS_EVENT = 'sahrae:progress';
const announce = () => { try { window.dispatchEvent(new Event(PROGRESS_EVENT)); } catch { /* no window */ } };

function read(key: string): WatchProgress[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as WatchProgress[]) : [];
  } catch { return []; }
}
function write(key: string, list: WatchProgress[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { console.error('Failed to save watch progress', e); }
  setTimeout(announce, 0);
}

export { resumePoint } from '../services/resume';

export function useWatchProgress() {
  const [progress, setProgress] = useState<WatchProgress[]>([]);
  const { user, activeProfile } = useAuth();
  const key = storageKey(scopeKey(user?.uid, activeProfile?.id));

  // Read on mount and on user/profile change, and again whenever another part
  // of the app saves progress (the player and Home each hold this hook).
  useEffect(() => {
    const load = () => setProgress(read(key));
    load();
    window.addEventListener(PROGRESS_EVENT, load);
    return () => window.removeEventListener(PROGRESS_EVENT, load);
  }, [key]);

  const saveProgress = (
    mediaId: number,
    mediaType: 'movie' | 'tv',
    item: MediaItem,
    season?: number,
    episode?: number,
  ) => {
    const minimalItem = {
      id: item.id,
      title: item.title || '',
      name: item.name || '',
      poster_path: item.poster_path || '',
      backdrop_path: item.backdrop_path || '',
      media_type: mediaType,
      release_date: item.release_date || '',
      first_air_date: item.first_air_date || '',
      // Genres feed the taste profile (services/tasteProfile.ts): list items
      // carry genre_ids, full details carry genres. A few ids is all it needs.
      genre_ids: ((item as { genre_ids?: number[] }).genre_ids
        || (item as { genres?: { id: number }[] }).genres?.map((g) => g.id)
        || []).slice(0, 4),
    } as MediaItem;

    const list = read(key);
    const before = list.find((p) => p.mediaId === mediaId);
    const sameEpisode = before && (before.season || 1) === (season || 1) && (before.episode || 1) === (episode || 1);
    const entry: WatchProgress = {
      mediaId, mediaType, season, episode, timestamp: Date.now(), item: minimalItem,
      // Opening the title again keeps its server; the minute only while it is the same episode.
      server: before?.server,
      ...(sameEpisode ? { position: before?.position, duration: before?.duration } : {}),
    };
    const updated = [entry, ...list.filter((p) => p.mediaId !== mediaId)].slice(0, MAX_ENTRIES);
    setProgress(updated);
    write(key, updated);
  };

  /** Record the server and the clock for a title already in the list (the player calls this as it plays). */
  const savePosition = (mediaId: number, at: { server?: string; position?: number; duration?: number; season?: number; episode?: number }) => {
    const list = read(key);
    const i = list.findIndex((p) => p.mediaId === mediaId);
    if (i < 0) return;
    const p = list[i];
    const next: WatchProgress = {
      ...p,
      ...(at.season ? { season: at.season } : {}),
      ...(at.episode ? { episode: at.episode } : {}),
      ...(at.server ? { server: at.server } : {}),
      ...(typeof at.position === 'number' && at.position > 0 ? { position: Math.floor(at.position) } : {}),
      ...(typeof at.duration === 'number' && at.duration > 0 ? { duration: Math.floor(at.duration) } : {}),
      timestamp: Date.now(),
    };
    const updated = [next, ...list.filter((_, j) => j !== i)];
    setProgress(updated);
    write(key, updated);
  };

  const removeProgress = (mediaId: number) => {
    const updated = read(key).filter((p) => p.mediaId !== mediaId);
    setProgress(updated);
    write(key, updated);
  };

  const getProgress = (mediaId: number) => read(key).find((p) => p.mediaId === mediaId);

  return { progress, saveProgress, savePosition, removeProgress, getProgress };
}
