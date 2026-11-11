import { useState, useEffect } from 'react';
import { MediaItem } from '../services/tmdb';
import { useAuth } from './useAuth';
import { adoptOrphans } from '../services/orphanLists';

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
  const { user, activeProfile, profiles } = useAuth();
  const onlyProfile = profiles.length <= 1;

  useEffect(() => {
    const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
    const load = () => {
      try {
        const stored = localStorage.getItem(key);
        const list = stored ? JSON.parse(stored) : [];
        // As Continue Watching: a one-profile account's list under an older profile id.
        if ((!Array.isArray(list) || !list.length) && onlyProfile && user?.uid && activeProfile?.id) {
          setMyList(adoptOrphans(localStorage, 'sahrae_my_list_', user.uid, key) as MediaItem[]);
          return;
        }
        setMyList(list);
      } catch {
        setMyList([]);
      }
    };
    load();
    // The account sync announces titles merged in from another device (services/cloudSync.ts).
    window.addEventListener('sahrae:mylist', load);
    return () => window.removeEventListener('sahrae:mylist', load);
  }, [user, activeProfile, onlyProfile]);

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
