/**
 * Sahrae's own audio engine for songs (Android app).
 *
 * A YouTube song normally plays inside YouTube's embedded player, which runs
 * in a cross-origin frame: its sound never passes through Sahrae, so the
 * equaliser cannot touch it (owner, 2026-11-01: "make the equaliser actually
 * work"). With the equaliser on, the Android app instead fetches the song's
 * audio itself (the same route a download takes: Piped's proxied stream, else
 * the app's on-device resolver, fetched through /__ddfetch), hands it to the
 * <audio> element as a same-origin Blob, and the Web Audio chain (eqWeb.ts)
 * shapes it. It keeps playing with the screen off too. If the audio cannot be
 * had in time, the song plays in YouTube's player as before.
 *
 * Not on the web: a browser cannot fetch YouTube's audio, so there songs stay
 * in YouTube's player and the equaliser works on podcasts and downloads.
 */
import { Capacitor } from '@capacitor/core';
import { ytmusic } from './ytmusic';
import { loadEq, nativeEqActive } from './eq';

export const hifiAvailable = (): boolean => Capacitor.isNativePlatform();
/** Songs go through the engine when the equaliser is on (and the app can). */
// Only on a phone that refuses Android's own effects (AudioFx.java): where they
// work, a song stays in YouTube's player and is shaped on its way out.
export const hifiWanted = (): boolean => hifiAvailable() && loadEq().on && !nativeEqActive();

const KEEP = 3;
const ready = new Map<string, string>(); // YouTube id -> blob: URL
const pending = new Map<string, Promise<string | null>>();

function keepOnly(latest: string) {
  const ids = [...ready.keys()];
  while (ids.length > KEEP) {
    const old = ids.shift()!;
    if (old === latest) continue;
    try { URL.revokeObjectURL(ready.get(old)!); } catch { /* already gone */ }
    ready.delete(old);
  }
}

async function fetchBytes(url: string): Promise<Blob | null> {
  for (const u of [url, `https://localhost/__ddfetch?u=${encodeURIComponent(url)}`]) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const b = await r.blob();
      if (b.size > 50_000) return b;
    } catch { /* next route */ }
  }
  return null;
}

/** A same-origin, seekable source for this song's audio, or null within `timeoutMs`. */
export function hifiSrc(ytId: string, timeoutMs = 15_000): Promise<string | null> {
  if (ready.has(ytId)) return Promise.resolve(ready.get(ytId)!);
  if (!pending.has(ytId)) {
    pending.set(ytId, (async () => {
      const a = await ytmusic.audioStream(ytId).catch(() => null);
      if (!a) return null;
      const blob = await fetchBytes(a.url);
      if (!blob) return null;
      const src = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: a.mime }));
      ready.set(ytId, src);
      keepOnly(ytId);
      return src;
    })().catch(() => null).finally(() => pending.delete(ytId)));
  }
  return Promise.race([
    pending.get(ytId)!,
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
}

/** Fetch the next song's audio ahead of time, so it starts at once. */
export const prefetchHifi = (ytId: string): void => { if (hifiWanted() && !ytId.startsWith('dz:')) void hifiSrc(ytId, 60_000); };
