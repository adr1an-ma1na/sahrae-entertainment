import { useEffect, useState } from 'react';
import { CHANGED, LIST_KEY } from '../services/notify';
import type { StoredNote } from '../services/notifyCore';

/**
 * The list behind the bell. What goes into it is decided elsewhere
 * (services/notify.ts, run from App): matches of the teams and sports the
 * viewer watches, new episodes of their series, films on their list. This hook
 * only reads it and marks it. It used to make the list itself, from My List
 * alone, and put a welcome card in an empty one: that card was all most
 * viewers ever saw (owner, 2026-11-15).
 */
export interface AppNotification extends Omit<StoredNote, 'kind' | 'mediaId' | 'mediaType'> {
  /** Older saved notes have no kind: they are all about a title. */
  kind?: StoredNote['kind'];
  mediaId: number;
  mediaType: 'movie' | 'tv';
}

function load(): AppNotification[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((n) => n && typeof n.id === 'string' && n.id !== 'welcome_notif')
      .slice(0, 50)
      .map((n) => ({ ...n, mediaId: Number(n.mediaId) || 0, mediaType: n.mediaType === 'tv' ? 'tv' : 'movie' }));
  } catch { return []; }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(load);

  // Several parts of the app show these (the phone's bell, Settings, the sidebar's dot): one list.
  useEffect(() => {
    const reload = () => setNotifications((prev) => {
      const next = load();
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
    window.addEventListener(CHANGED, reload);
    window.addEventListener('storage', reload);
    return () => { window.removeEventListener(CHANGED, reload); window.removeEventListener('storage', reload); };
  }, []);

  const save = (next: AppNotification[]) => {
    setNotifications(next);
    try { localStorage.setItem(LIST_KEY, JSON.stringify(next)); } catch { /* this session still has them */ }
    window.dispatchEvent(new Event(CHANGED));
  };

  const markAsRead = (id: string) => save(load().map((n) => (n.id === id ? { ...n, read: true } : n)));
  const markAllAsRead = () => save(load().map((n) => ({ ...n, read: true })));
  // Cleared notes stay in the "seen" list (services/notify.ts), so they do not come back.
  const clearNotifications = () => save([]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications };
}
