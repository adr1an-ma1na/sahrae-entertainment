import { Capacitor } from '@capacitor/core';

/**
 * Video downloads (movies / series) captured by the native layer into the app's
 * private storage (see DownloadStore.java). The Downloads section reads this list
 * and plays the files in-app — they never appear in the device file manager.
 */
export interface VideoDownload {
  id: number;
  title: string;
  file: string;
  mime: string;
  ts: number;
  done: boolean;
}

export async function listVideoDownloads(): Promise<VideoDownload[]> {
  try {
    const r = await fetch('https://localhost/__dllist', { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? (j as VideoDownload[]) : [];
  } catch {
    return [];
  }
}

export function videoSrc(d: VideoDownload): string {
  const uri = d.file.startsWith('file://') ? d.file : 'file://' + d.file;
  try { return Capacitor.convertFileSrc(uri); } catch { return uri; }
}

export async function removeVideoDownload(id: number): Promise<void> {
  try { await fetch(`https://localhost/__dlremove?id=${id}`); } catch { /* ignore */ }
}

/** Tell native what to title the next captured download (the movie/show name). */
export async function setDownloadTitle(title: string): Promise<void> {
  try { await fetch(`https://localhost/__dltitle?t=${encodeURIComponent(title)}`); } catch { /* ignore */ }
}
