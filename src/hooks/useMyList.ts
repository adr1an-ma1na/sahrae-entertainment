import { useState, useEffect } from 'react';
import { MediaItem } from '../services/tmdb';
import { useAuth } from './useAuth';
import { db } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError } from '../firebase-error';

const STORAGE_KEY = 'sahrae_my_list';

export function useMyList() {
  const [myList, setMyList] = useState<MediaItem[]>([]);
  const { user, activeProfile } = useAuth();

  useEffect(() => {
    if (user && activeProfile) {
      const unsubscribe = onSnapshot(collection(db, `users/${user.uid}/profiles/${activeProfile.id}/myList`), (snapshot) => {
        const items = snapshot.docs.map(doc => doc.data() as MediaItem);
        // Sort by addedAt descending
        items.sort((a, b) => {
          const dateA = (a as any).addedAt ? new Date((a as any).addedAt).getTime() : 0;
          const dateB = (b as any).addedAt ? new Date((b as any).addedAt).getTime() : 0;
          return dateB - dateA;
        });
        setMyList(items);
      }, (error) => {
        console.error('Firestore Error: ', error);
      });
      return () => unsubscribe();
    } else if (!user) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          setMyList(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse my list', e);
        }
      } else {
        setMyList([]);
      }
    } else {
      setMyList([]);
    }
  }, [user, activeProfile]);

  const toggleMyList = async (item: MediaItem) => {
    try {
      const exists = myList.find(p => p.id === item.id);
      
      if (user && activeProfile) {
        const docRef = doc(db, `users/${user.uid}/profiles/${activeProfile.id}/myList`, item.id.toString());
        if (exists) {
          await deleteDoc(docRef);
        } else {
          const minimalItem = {
            id: item.id,
            title: item.title || null,
            name: item.name || null,
            overview: item.overview || '',
            poster_path: item.poster_path || null,
            backdrop_path: item.backdrop_path || null,
            media_type: item.media_type || (item.name ? 'tv' : 'movie'),
            release_date: item.release_date || null,
            first_air_date: item.first_air_date || null,
            addedAt: new Date().toISOString()
          };
          
          // Remove null values to avoid Firestore errors with undefined/null in some cases
          const cleanItem = Object.fromEntries(Object.entries(minimalItem).filter(([_, v]) => v !== null));
          
          try {
            await setDoc(docRef, cleanItem);
          } catch(e) {
            handleFirestoreError(e, 'create', `users/${user.uid}/profiles/${activeProfile.id}/myList/${item.id}`, user);
          }
        }
      } else if (!user) {
        setMyList(prev => {
          let updated;
          if (exists) {
            updated = prev.filter(p => p.id !== item.id);
          } else {
            const minimalItem = {
              id: item.id,
              title: item.title || null,
              name: item.name || null,
              overview: item.overview || '',
              poster_path: item.poster_path || null,
              backdrop_path: item.backdrop_path || null,
              media_type: item.media_type || (item.name ? 'tv' : 'movie'),
              release_date: item.release_date || null,
              first_air_date: item.first_air_date || null,
              addedAt: new Date().toISOString()
            };
            const cleanItem = Object.fromEntries(Object.entries(minimalItem).filter(([_, v]) => v !== null)) as unknown as MediaItem;
            updated = [cleanItem, ...prev];
          }
          
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch (e) {
            console.error('Failed to save my list to localStorage', e);
          }
          
          return updated;
        });
      }
    } catch (error) {
      console.error("Error toggling my list:", error);
    }
  };

  const isInMyList = (id: number) => {
    return myList.some(p => p.id === id);
  };

  return { myList, toggleMyList, isInMyList };
}
