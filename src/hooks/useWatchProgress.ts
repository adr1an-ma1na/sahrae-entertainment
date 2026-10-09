import { useState, useEffect } from 'react';
import { MediaItem } from '../services/tmdb';
import { useAuth } from './useAuth';

/**
 * Firebase (app, auth and Firestore: ~540 kB, plus an anonymous sign-in and a
 * live connection) is loaded on demand, not at start-up. It used to initialise
 * when this module was imported, on every launch, before the first screen. The
 * on-device copy in localStorage is the source of truth either way.
 */
const cloud = () => Promise.all([import('firebase/firestore'), import('../services/firebase-real')])
  .then(([store, real]) => ({ ...store, ...real }));

/** Cloud sync waits until the first screen has had time to settle. */
const SYNC_DELAY_MS = 8000;

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
      await new Promise((r) => setTimeout(r, SYNC_DELAY_MS));
      if (isCancelled) return;
      const { collection, query, orderBy, limit, onSnapshot, db, syncFirebaseAuth, handleFirestoreError, OperationType } = await cloud();
      if (isCancelled) return;
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

    setupSync().catch(() => { /* offline or blocked: the local copy stands */ });

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
    let c: Awaited<ReturnType<typeof cloud>> | null = null;
    try {
      c = await cloud();
      const { fbAuth, syncFirebaseAuth, setDoc, doc, db } = c;
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
      if (!c) return; // Firebase did not load (offline): the local copy stands
      const profileId = activeProfile?.id || 'default';
      const docPath = `users/${c.fbAuth.currentUser?.uid || 'unknown'}/profiles/${profileId}/watchProgress/${mediaId}`;
      c.handleFirestoreError(e, c.OperationType.WRITE, docPath);
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
    let c: Awaited<ReturnType<typeof cloud>> | null = null;
    try {
      c = await cloud();
      const { fbAuth, syncFirebaseAuth, deleteDoc, doc, db } = c;
      const fbUid = fbAuth.currentUser?.uid || await syncFirebaseAuth(user);
      if (fbUid) {
        const profileId = activeProfile?.id || 'default';
        const docPath = `users/${fbUid}/profiles/${profileId}/watchProgress/${mediaId}`;
        await deleteDoc(doc(db, 'users', fbUid, 'profiles', profileId, 'watchProgress', String(mediaId)));
      }
    } catch (e) {
      if (!c) return; // Firebase did not load (offline): the local copy stands
      const profileId = activeProfile?.id || 'default';
      const docPath = `users/${c.fbAuth.currentUser?.uid || 'unknown'}/profiles/${profileId}/watchProgress/${mediaId}`;
      c.handleFirestoreError(e, c.OperationType.DELETE, docPath);
    }
  };

  const getProgress = (mediaId: number) => progress.find((p) => p.mediaId === mediaId);

  return { progress, saveProgress, removeProgress, getProgress };
}
