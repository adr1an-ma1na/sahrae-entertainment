import { useState, useEffect } from 'react';
import { MediaItem } from '../services/tmdb';
import { useAuth } from './useAuth';

/**
 * "My List" stored on-device, scoped to the signed-in user + active profile
 * (falls back to a shared local scope when nobody is signed in).
 */

function scopeKey(uid?: string, profileId?: string): string {
  if (uid && profileId) return `${uid}_${profileId}`;
  if (uid) return uid;
  return 'local';
}
const storageKey = (scope: string) => `sahrae_my_list_${scope}`;

export function useMyList() {
  const [myList, setMyList] = useState<MediaItem[]>([]);
  const { user, activeProfile } = useAuth();

  useEffect(() => {
    const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
    try {
      const stored = localStorage.getItem(key);
      setMyList(stored ? JSON.parse(stored) : []);
    } catch {
      setMyList([]);
    }
  }, [user, activeProfile]);

  const toggleMyList = (item: MediaItem) => {
    const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
    setMyList((prev) => {
      const exists = prev.find((p) => p.id === item.id);
      let updated: MediaItem[];
      if (exists) {
        updated = prev.filter((p) => p.id !== item.id);
      } else {
        const minimal = {
          id: item.id,
          title: item.title,
          name: item.name,
          overview: item.overview || '',
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          media_type: item.media_type || (item.name ? 'tv' : 'movie'),
          release_date: item.release_date,
          first_air_date: item.first_air_date,
          addedAt: new Date().toISOString(),
        } as unknown as MediaItem;
        updated = [minimal, ...prev];
      }
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save my list', e);
      }
      return updated;
    });
  };

  const isInMyList = (id: number) => myList.some((p) => p.id === id);

  return { myList, toggleMyList, isInMyList };
}
