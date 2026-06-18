import { useEffect, useState } from 'react';
import { Track } from './ytmusic';

/**
 * Downloads store — the user's saved-for-offline library, surfaced in the
 * Downloads section. Persisted to localStorage and reactive via a tiny pub/sub
 * so any view (Sauti library, Downloads tab) updates instantly.
 *
 * NOTE: actual on-device file caching of the audio is a follow-up (it needs the
 * direct-audio engine); today this is the durable "downloaded" list that the
 * Downloads section reads. Kept isolated from the player so it can't affect
 * playback reliability.
 */
const KEY = 'sahrae.downloads.v1';
type Listener = () => void;
const listeners = new Set<Listener>();

function read(): Track[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(list: Track[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

export const downloads = {
  list: read,
  has: (id: string) => read().some((t) => t.id === id),
  add: (t: Track) => { const l = read(); if (!l.some((x) => x.id === t.id)) write([t, ...l]); },
  toggle: (t: Track): boolean => {
    const l = read();
    const exists = l.some((x) => x.id === t.id);
    write(exists ? l.filter((x) => x.id !== t.id) : [t, ...l]);
    return !exists;
  },
  remove: (id: string) => write(read().filter((t) => t.id !== id)),
  subscribe: (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

export function useDownloads(): Track[] {
  const [list, setList] = useState<Track[]>(read);
  useEffect(() => downloads.subscribe(() => setList(read())), []);
  return list;
}
