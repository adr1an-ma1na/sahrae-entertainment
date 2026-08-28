import { useEffect, useState } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Track, ytmusic } from './ytmusic';
import { blobStore, objectUrlFor, releaseUrl, freeBytes } from './blobStore';

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
interface Entry { track: Track; uri: string; mime: string; ts: number; size?: number }
type DState = { status: 'downloading' | 'done' | 'error'; progress: number; error?: string };
type Listener = () => void;

const KEY = 'sahrae.downloads.v2';
const listeners = new Set<Listener>();
const states = new Map<string, DState>();

function read(): Entry[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function write(list: Entry[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } emit(); }
function emit() { listeners.forEach((l) => { try { l(); } catch { /* ignore */ } }); }

// Base64 (no data: prefix) for a byte array, sub-chunked so fromCharCode never
// overflows the call stack.
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

// File-system-safe name (track ids can contain ':' etc. — invalid in paths).
function safeName(id: string): string { return id.replace(/[^a-zA-Z0-9._-]/g, '_'); }

// Open a response — direct first, then the native passthrough (CORS/IP). We do
// NOT require a streamable body here: some intercepted/proxy responses are `ok`
// but expose no ReadableStream, and the caller falls back to arrayBuffer.
async function openStream(url: string): Promise<Response | null> {
  try { const r = await fetch(url); if (r.ok) return r; } catch { /* try proxy */ }
  try { const r = await fetch(`https://localhost/__ddfetch?u=${encodeURIComponent(url)}`); if (r.ok) return r; } catch { /* give up */ }
  return null;
}

export const downloads = {
  list: (): Track[] => read().map((e) => e.track),
  has: (id: string) => read().some((e) => e.track.id === id),
  /** Total bytes used by downloaded music. */
  bytesUsed: (): number => read().reduce((s, e) => s + (e.size || 0), 0),
  state: (id: string): DState | undefined => states.get(id),

  /**
   * A locally-playable src for a downloaded track, else null.
   *
   * Async because a web download lives as a Blob in IndexedDB and its object URL
   * has to be read out. Native still resolves synchronously underneath — the
   * promise just settles immediately there.
   */
  localSrcAsync: async (id: string): Promise<string | null> => {
    const e = read().find((x) => x.track.id === id);
    if (!e) return null;
    if (e.uri.startsWith('idb:')) return objectUrlFor(id);
    try { return Capacitor.convertFileSrc(e.uri); } catch { return e.uri; }
  },

  async download(track: Track): Promise<boolean> {
    if (read().some((e) => e.track.id === track.id)) return true;
    states.set(track.id, { status: 'downloading', progress: 0 }); emit();
    try {
      // Direct-file tracks (Audius / podcasts) carry audioUrl; YouTube tracks
      // resolve a stream URL. Direct URLs are why these actually download.
      let url: string;
      let mime = 'audio/mpeg';
      if (track.audioUrl) { url = track.audioUrl; }
      else { const a = await ytmusic.audioStream(track.id); if (!a) throw new Error('no audio stream'); url = a.url; mime = a.mime; }

      const resp = await openStream(url);
      if (!resp) throw new Error("This show's server won't allow downloads from the browser. The Android app can still download it.");
      const total = Number(resp.headers.get('content-length') || 0);

      // ── WEB: store the Blob whole ──
      // Capacitor's web Filesystem keeps files as base64 text in IndexedDB and
      // this path used to append to it thousands of times, which blew the origin
      // quota on anything podcast-length and left Downloads mysteriously empty.
      if (!Capacitor.isNativePlatform()) {
        const room = await freeBytes();
        if (room !== null && total > 0 && total > room) {
          throw new Error(`Not enough space in the browser for this one (needs ${Math.round(total / 1e6)} MB, ${Math.round(room / 1e6)} MB free). Remove a download and try again.`);
        }
        const blob = await resp.blob();
        if (blob.size < 10000) throw new Error('The file came back empty.');
        await blobStore.put(track.id, blob);
        write([{ track, uri: `idb:${track.id}`, mime: blob.type || mime, ts: Date.now(), size: blob.size }, ...read().filter((e) => e.track.id !== track.id)]);
        states.set(track.id, { status: 'done', progress: 1 }); emit();
        return true;
      }

      const path = `downloads/${safeName(track.id)}.dat`;
      await Filesystem.writeFile({ path, data: '', directory: Directory.Data, recursive: true });
      let size = 0;

      if (resp.body && typeof resp.body.getReader === 'function') {
        // BEST: stream to disk in 3-byte-aligned base64 chunks — never holds the
        // whole file (or its base64) in memory. Prevents the OOM crash on big
        // podcasts while the <audio> is also buffering the same episode.
        const reader = resp.body.getReader();
        let carry = new Uint8Array(0);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || !value.length) continue;
          size += value.length;
          let buf: Uint8Array;
          if (carry.length) { buf = new Uint8Array(carry.length + value.length); buf.set(carry); buf.set(value, carry.length); }
          else buf = value;
          const usable = buf.length - (buf.length % 3);
          if (usable > 0) await Filesystem.appendFile({ path, data: bytesToBase64(buf.subarray(0, usable)), directory: Directory.Data });
          carry = new Uint8Array(buf.subarray(usable)); // 0–2 trailing bytes, copied out
          states.set(track.id, { status: 'downloading', progress: total ? Math.min(0.99, size / total) : 0 }); emit();
        }
        if (carry.length) await Filesystem.appendFile({ path, data: bytesToBase64(carry), directory: Directory.Data });
      } else {
        // FALLBACK (proxy responses with no ReadableStream): buffer once, then
        // write in chunks. Still avoids the ~3x dataURL blowup of the old path.
        const bytes = new Uint8Array(await resp.arrayBuffer());
        size = bytes.length;
        const STEP = 3 * 0x10000; // 192 KB, 3-byte aligned
        for (let i = 0; i < bytes.length; i += STEP) {
          await Filesystem.appendFile({ path, data: bytesToBase64(bytes.subarray(i, Math.min(i + STEP, bytes.length))), directory: Directory.Data });
          states.set(track.id, { status: 'downloading', progress: total ? Math.min(0.99, Math.min(i + STEP, bytes.length) / total) : 0 }); emit();
        }
      }
      if (size < 10000) throw new Error('audio too small');

      const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
      write([{ track, uri, mime, ts: Date.now(), size }, ...read().filter((e) => e.track.id !== track.id)]);
      states.set(track.id, { status: 'done', progress: 1 }); emit();
      return true;
    } catch (err) {
      // Keep WHY. This used to be a bare catch, so a download that failed for a
      // real, explainable reason (no space, server blocks it) looked identical
      // to one that never started, and the Downloads screen just stayed empty.
      const message = err instanceof Error ? err.message : 'Download failed.';
      try { await blobStore.del(track.id); } catch { /* nothing stored */ }
      try { await Filesystem.deleteFile({ path: `downloads/${safeName(track.id)}.dat`, directory: Directory.Data }); } catch { /* ignore partial cleanup */ }
      states.set(track.id, { status: 'error', progress: 0, error: message }); emit();
      setTimeout(() => { states.delete(track.id); emit(); }, 8000);
      return false;
    }
  },

  async remove(id: string): Promise<void> {
    write(read().filter((x) => x.track.id !== id));
    states.delete(id);
    releaseUrl(id);
    try { await blobStore.del(id); } catch { /* not a web download */ }
    try { await Filesystem.deleteFile({ path: `downloads/${safeName(id)}.dat`, directory: Directory.Data }); } catch { /* ignore */ }
  },

  subscribe: (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

export function useDownloads(): Track[] {
  const [, force] = useState(0);
  useEffect(() => downloads.subscribe(() => force((n) => n + 1)), []);
  return downloads.list();
}
