import { useState, useEffect } from 'react';
import { MediaItem } from '../services/tmdb';
import { useAuth } from './useAuth';

export interface WatchProgress {
  mediaId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  timestamp: number; // Date.now()
  item: MediaItem;
}

/** Continue-watching history stored on-device, scoped per user + profile. */

function scopeKey(uid?: string, profileId?: string): string {
  if (uid && profileId) return `${uid}_${profileId}`;
  if (uid) return uid;
  return 'local';
}
const storageKey = (scope: string) => `sahrae_watch_progress_${scope}`;

export function useWatchProgress() {
  const [progress, setProgress] = useState<WatchProgress[]>([]);
  const { user, activeProfile } = useAuth();

  useEffect(() => {
    const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
    try {
      const stored = localStorage.getItem(key);
      setProgress(stored ? (JSON.parse(stored) as WatchProgress[]) : []);
    } catch {
      setProgress([]);
    }
  }, [user, activeProfile]);

  const saveProgress = (
    mediaId: number,
    mediaType: 'movie' | 'tv',
    item: MediaItem,
    season?: number,
    episode?: number,
  ) => {
    const minimalItem = {
      id: item.id,
      title: item.title,
      name: item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      media_type: mediaType,
      release_date: item.release_date,
      first_air_date: item.first_air_date,
    } as MediaItem;

    const newProgress: WatchProgress = {
      mediaId,
      mediaType,
      season,
      episode,
      timestamp: Date.now(),
      item: minimalItem,
    };

    const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
    setProgress((prev) => {
      const filtered = prev.filter((p) => p.mediaId !== mediaId);
      const updated = [newProgress, ...filtered].slice(0, 20);
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save watch progress', e);
      }
      return updated;
    });
  };

  const removeProgress = (mediaId: number) => {
    const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
    setProgress((prev) => {
      const updated = prev.filter((p) => p.mediaId !== mediaId);
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to update watch progress', e);
      }
      return updated;
    });
  };

  const getProgress = (mediaId: number) => progress.find((p) => p.mediaId === mediaId);

  return { progress, saveProgress, removeProgress, getProgress };
}
