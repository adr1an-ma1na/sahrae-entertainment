import { Capacitor } from '@capacitor/core';

/**
 * Movie / series downloads.
 *
 * WHAT THIS USED TO DO, AND WHY IT IS GONE: the previous implementation never
 * downloaded a movie at all. It fetched a Big Buck Bunny sample or, when that
 * failed, drew a 2-second "SAHRAE · OFFLINE PLAYER" animation on a canvas with
 * MediaRecorder, stored that in IndexedDB, and reported "Downloaded". Every
 * download therefore played a placeholder clip instead of the film.
 *
 * A real file can only be captured by the Android shell: VidVault's download
 * button triggers a WebView download, which MainActivity's DownloadListener
 * hands to DownloadStore → the app's own directory
 * (Android/data/<pkg>/files/Download) → listed here through /__dllist.
 *
 * On the web build there is no such capture path (a browser cannot intercept a
 * cross-origin download into app storage), so the list is simply empty there and
 * the UI says so. That is a real platform limit, not something to paper over.
 */

export interface VideoDownloadItem {
  /** DownloadManager id, as a string. */
  id: string;
  title: string;
  /** Absolute path of the saved file inside the app's own storage. */
  file: string;
  mime: string;
  /** Epoch ms when the download was queued. */
  timestamp: number;
  /** False while DownloadManager is still fetching it. */
  done: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange() {
  listeners.forEach((l) => {
    try { l(); } catch (e) { console.error(e); }
  });
}

export const isNativeDownloadSupported = () => Capacitor.isNativePlatform();

export const videoDownloads = {
  subscribe: (fn: Listener) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /** Real downloads captured by the Android shell. Empty array on the web. */
  list: async (): Promise<VideoDownloadItem[]> => {
    if (!Capacitor.isNativePlatform()) return [];
    try {
      const r = await fetch('https://localhost/__dllist', { cache: 'no-store' });
      if (!r.ok) return [];
      const rows = await r.json();
      if (!Array.isArray(rows)) return [];
      return rows
        .map((o: any): VideoDownloadItem => ({
          id: String(o.id),
          title: o.title || 'Download',
          file: o.file || '',
          mime: o.mime || 'video/mp4',
          timestamp: Number(o.ts) || 0,
          done: !!o.done,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  },

  /**
   * Playable source for a saved file. Capacitor maps the app's own files onto an
   * https://localhost/_capacitor_file_ origin the WebView is allowed to read.
   */
  localSrc: (item: VideoDownloadItem): string | null => {
    if (!item.done || !item.file) return null;
    try {
      return Capacitor.convertFileSrc(item.file);
    } catch {
      return null;
    }
  },

  /** Tell the native side what to name the next captured download. */
  setPendingTitle: async (title: string): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await fetch(`https://localhost/__dltitle?t=${encodeURIComponent(title)}`, { cache: 'no-store' });
    } catch { /* best effort */ }
  },

  remove: async (id: string): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await fetch(`https://localhost/__dlremove?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    } catch { /* ignore */ }
    emitChange();
  },

  totalBytesUsed: async (): Promise<number> => {
    // DownloadManager does not report per-file size back through this bridge, so
    // rather than invent a number the Downloads screen omits the storage total.
    return 0;
  },
};
