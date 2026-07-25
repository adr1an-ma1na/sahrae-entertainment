import { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { MediaItem } from '../services/tmdb';
import { useAuth } from './useAuth';
import { 
  db, 
  fbAuth, 
  syncFirebaseAuth, 
  handleFirestoreError, 
  OperationType 
} from '../services/firebase-real';

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

  // Local fallback hydration on mount/user/profile change
  useEffect(() => {
    const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
    try {
      const stored = localStorage.getItem(key);
      setProgress(stored ? (JSON.parse(stored) as WatchProgress[]) : []);
    } catch {
      setProgress([]);
    }
  }, [user, activeProfile]);

  // Real-time Cloud Sync with Firestore
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isCancelled = false;

    async function setupSync() {
      // Authenticate to real Firebase
      const fbUid = await syncFirebaseAuth(user);
      if (isCancelled || !fbUid) return;

      const profileId = activeProfile?.id || 'default';
      const path = `users/${fbUid}/profiles/${profileId}/watchProgress`;

      const q = query(
        collection(db, path),
        orderBy('timestamp', 'desc'),
        limit(20)
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: WatchProgress[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            items.push({
              mediaId: Number(data.mediaId),
              mediaType: data.mediaType,
              season: data.season || undefined,
              episode: data.episode || undefined,
              timestamp: Number(data.timestamp),
              item: data.item as MediaItem,
            });
          });
          setProgress(items);

          // Update local fallback as well
          const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
          try {
            localStorage.setItem(key, JSON.stringify(items));
          } catch (e) {
            console.error('Failed to sync watch progress locally', e);
          }
        },
        (error) => {
          // If we cancel early or if it's permission denied, handle gracefully
          if (!isCancelled) {
            handleFirestoreError(error, OperationType.GET, path);
          }
        }
      );
    }

    setupSync();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, activeProfile]);

  const saveProgress = async (
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
    } as MediaItem;

    const newProgress: WatchProgress = {
      mediaId,
      mediaType,
      season,
      episode,
      timestamp: Date.now(),
      item: minimalItem,
    };

    // Update local state immediately for snappy user experience
    const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
    setProgress((prev) => {
      const filtered = prev.filter((p) => p.mediaId !== mediaId);
      const updated = [newProgress, ...filtered].slice(0, 20);
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save watch progress locally', e);
      }
      return updated;
    });

    // Save to Firestore in background
    try {
      const fbUid = fbAuth.currentUser?.uid || await syncFirebaseAuth(user);
      if (fbUid) {
        const profileId = activeProfile?.id || 'default';
        const docPath = `users/${fbUid}/profiles/${profileId}/watchProgress/${mediaId}`;
        const payload = {
          mediaId,
          mediaType,
          season: season || null,
          episode: episode || null,
          timestamp: Date.now(),
          item: minimalItem,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'users', fbUid, 'profiles', profileId, 'watchProgress', String(mediaId)), payload);
      }
    } catch (e) {
      const profileId = activeProfile?.id || 'default';
      const docPath = `users/${fbAuth.currentUser?.uid || 'unknown'}/profiles/${profileId}/watchProgress/${mediaId}`;
      handleFirestoreError(e, OperationType.WRITE, docPath);
    }
  };

  const removeProgress = async (mediaId: number) => {
    // Update local state immediately
    const key = storageKey(scopeKey(user?.uid, activeProfile?.id));
    setProgress((prev) => {
      const updated = prev.filter((p) => p.mediaId !== mediaId);
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to remove watch progress locally', e);
      }
      return updated;
    });

    // Delete from Firestore in background
    try {
      const fbUid = fbAuth.currentUser?.uid || await syncFirebaseAuth(user);
      if (fbUid) {
        const profileId = activeProfile?.id || 'default';
        const docPath = `users/${fbUid}/profiles/${profileId}/watchProgress/${mediaId}`;
        await deleteDoc(doc(db, 'users', fbUid, 'profiles', profileId, 'watchProgress', String(mediaId)));
      }
    } catch (e) {
      const profileId = activeProfile?.id || 'default';
      const docPath = `users/${fbAuth.currentUser?.uid || 'unknown'}/profiles/${profileId}/watchProgress/${mediaId}`;
      handleFirestoreError(e, OperationType.DELETE, docPath);
    }
  };

  const getProgress = (mediaId: number) => progress.find((p) => p.mediaId === mediaId);

  return { progress, saveProgress, removeProgress, getProgress };
}
