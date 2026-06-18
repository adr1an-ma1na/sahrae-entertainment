import { useEffect, useState } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Track, ytmusic } from './ytmusic';

/**
 * Real, in-app offline downloads (Netflix-style).
 *
 * The audio is fetched from Sauti's source and written to the app's PRIVATE
 * storage (Directory.Data) — so it lives inside the app's Downloads section and
 * does NOT appear in the device file manager. Playback then happens locally via
 * an <audio> element (see useMusic), with the native global EQ still applied.
 *
 * Reactive via a tiny pub/sub; isolated from the streaming player so a failed
 * download can never affect normal playback.
 */
interface Entry { track: Track; uri: string; mime: string; ts: number }
type DState = { status: 'downloading' | 'done' | 'error'; progress: number };
type Listener = () => void;

const KEY = 'sahrae.downloads.v2';
const listeners = new Set<Listener>();
const states = new Map<string, DState>();

function read(): Entry[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function write(list: Entry[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } emit(); }
function emit() { listeners.forEach((l) => { try { l(); } catch { /* ignore */ } }); }

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => { const s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

async function fetchBytes(url: string): Promise<Blob | null> {
  try { const r = await fetch(url); if (r.ok) return await r.blob(); } catch { /* try proxy */ }
  // CORS / IP fallback: pull it through the native passthrough.
  try { const r = await fetch(`https://localhost/__ddfetch?u=${encodeURIComponent(url)}`); if (r.ok) return await r.blob(); } catch { /* give up */ }
  return null;
}

export const downloads = {
  list: (): Track[] => read().map((e) => e.track),
  has: (id: string) => read().some((e) => e.track.id === id),
  state: (id: string): DState | undefined => states.get(id),

  /** A locally-playable src for a downloaded track, else null. */
  localSrc: (id: string): string | null => {
    const e = read().find((x) => x.track.id === id);
    if (!e) return null;
    try { return Capacitor.convertFileSrc(e.uri); } catch { return e.uri; }
  },

  async download(track: Track): Promise<boolean> {
    if (read().some((e) => e.track.id === track.id)) return true;
    states.set(track.id, { status: 'downloading', progress: 0 }); emit();
    try {
      const a = await ytmusic.audioStream(track.id);
      if (!a) throw new Error('no audio stream');
      const blob = await fetchBytes(a.url);
      if (!blob || blob.size < 10000) throw new Error('audio fetch failed');
      const base64 = await blobToBase64(blob);
      const path = `downloads/${track.id}.dat`;
      await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
      write([{ track, uri, mime: a.mime, ts: Date.now() }, ...read().filter((e) => e.track.id !== track.id)]);
      states.set(track.id, { status: 'done', progress: 1 }); emit();
      return true;
    } catch {
      states.set(track.id, { status: 'error', progress: 0 }); emit();
      setTimeout(() => { states.delete(track.id); emit(); }, 4000);
      return false;
    }
  },

  async remove(id: string): Promise<void> {
    write(read().filter((x) => x.track.id !== id));
    states.delete(id);
    try { await Filesystem.deleteFile({ path: `downloads/${id}.dat`, directory: Directory.Data }); } catch { /* ignore */ }
  },

  subscribe: (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

export function useDownloads(): Track[] {
  const [, force] = useState(0);
  useEffect(() => downloads.subscribe(() => force((n) => n + 1)), []);
  return downloads.list();
}
