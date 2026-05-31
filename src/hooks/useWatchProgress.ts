import { useState, useEffect } from 'react';
import { MediaItem } from '../services/tmdb';
import { useAuth } from './useAuth';
import { db } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError } from '../firebase-error';

export interface WatchProgress {
  mediaId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  timestamp: number; // Date.now()
  item: MediaItem;
}

const STORAGE_KEY = 'sahrae_watch_progress';

export function useWatchProgress() {
  const [progress, setProgress] = useState<WatchProgress[]>([]);
  const { user, activeProfile } = useAuth();

  useEffect(() => {
    if (user && activeProfile) {
      const unsubscribe = onSnapshot(collection(db, `users/${user.uid}/profiles/${activeProfile.id}/watchProgress`), (snapshot) => {
        const items = snapshot.docs.map(doc => doc.data() as WatchProgress);
        items.sort((a, b) => b.timestamp - a.timestamp);
        setProgress(items);
      }, (error) => {
        console.error('Firestore Error: ', error);
      });
      return () => unsubscribe();
    } else if (!user) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as WatchProgress[];
          const cleaned = parsed.map(p => ({
            ...p,
            item: {
              id: p.item?.id,
              title: p.item?.title,
              name: p.item?.name,
              poster_path: p.item?.poster_path,
              backdrop_path: p.item?.backdrop_path,
              media_type: p.mediaType,
              release_date: p.item?.release_date,
              first_air_date: p.item?.first_air_date
            } as MediaItem
          }));
          setProgress(cleaned);
        } catch (e) {
          console.error('Failed to parse watch progress', e);
          localStorage.removeItem(STORAGE_KEY);
        }
      } else {
        setProgress([]);
      }
    } else {
      setProgress([]);
    }
  }, [user, activeProfile]);

  const saveProgress = async (mediaId: number, mediaType: 'movie' | 'tv', item: MediaItem, season?: number, episode?: number) => {
    const minimalItem = {
      id: item.id,
      title: item.title || null,
      name: item.name || null,
      poster_path: item.poster_path || null,
      backdrop_path: item.backdrop_path || null,
      media_type: mediaType,
      release_date: item.release_date || null,
      first_air_date: item.first_air_date || null
    } as MediaItem;

    const newProgress: WatchProgress = {
      mediaId,
      mediaType,
      season: season || null as any,
      episode: episode || null as any,
      timestamp: Date.now(),
      item: minimalItem,
      updatedAt: new Date().toISOString()
    } as any;

    if (user && activeProfile) {
      const docRef = doc(db, `users/${user.uid}/profiles/${activeProfile.id}/watchProgress`, mediaId.toString());
      try {
        await setDoc(docRef, newProgress);
      } catch(e) {
        handleFirestoreError(e, 'create', `users/${user.uid}/profiles/${activeProfile.id}/watchProgress/${mediaId}`, user);
      }
    } else if (!user) {
      setProgress(prev => {
        const filtered = prev.filter(p => p.mediaId !== mediaId);
        const updated = [newProgress, ...filtered].slice(0, 20);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.error('Failed to save watch progress to localStorage', e);
          try {
            const reduced = updated.slice(0, 5);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
          } catch (e2) {
            console.error('Still failed to save after reducing size', e2);
          }
        }
        return updated;
      });
    }
  };

  const removeProgress = async (mediaId: number) => {
    if (user && activeProfile) {
      const docRef = doc(db, `users/${user.uid}/profiles/${activeProfile.id}/watchProgress`, mediaId.toString());
      await deleteDoc(docRef);
    } else if (!user) {
      setProgress(prev => {
        const updated = prev.filter(p => p.mediaId !== mediaId);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.error('Failed to update localStorage on remove', e);
        }
        return updated;
      });
    }
  };

  const getProgress = (mediaId: number) => {
    return progress.find(p => p.mediaId === mediaId);
  };

  return { progress, saveProgress, removeProgress, getProgress };
}
