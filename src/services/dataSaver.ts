import { useEffect, useState } from 'react';

/**
 * Data Saver, and what a viewing costs in mobile data.
 *
 * For most viewers here, data is the real price of streaming. So the app says
 * what a film will cost before it starts, measures what it did cost in the
 * Android app, and offers one switch that spends less:
 *   - films and episodes capped at 480p (Android app: it shortens the player's
 *     quality menu, see HlsCap.java; the web cannot reach inside the player)
 *   - smaller posters and backdrops everywhere
 *   - no video previews on hover
 * Music needs nothing: it plays through a 1-pixel YouTube player, which
 * YouTube already serves at its smallest picture.
 *
 * Data Saver is one of three picture settings. The other two keep films
 * sharp: HD (the default) never lets the player drop below 720p, Best keeps it
 * at 1080p. Adaptive players otherwise start low on mobile data and often stay
 * there, which viewers saw as soft pictures. The Android app enforces all
 * three by editing the player's quality menu; the web cannot.
 */

export type Picture = 'saver' | 'hd' | 'best';
const PICTURE_KEY = 'sahrae.picture.v1';
/** The floor sent to the Android app for each setting, in pixel rows. */
const FLOOR: Record<Picture, number> = { saver: 0, hd: 720, best: 1080 };

const KEY = 'sahrae.dataSaver.v1';
const EVENT = 'sahrae:datasaver';

let on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked: off */ }
// Best by default: the owner wants 1080p held (2026-10-26). HD is a choice for weak lines.
let picture: Picture = 'best';
try {
  const p = localStorage.getItem(PICTURE_KEY);
  // The HD/Best choice is gone from the player, so an old HD pick is not kept.
  void p;
  picture = on ? 'saver' : 'best';
} catch { /* storage blocked: HD */ }

type Caps = { dataSaver?: boolean; traffic?: boolean; quality?: boolean };
const caps = (): Caps => (window as unknown as { __sahraeCaps?: Caps }).__sahraeCaps || {};

/** Can this shell cap video quality (the Android app)? */
export const canCapVideo = () => caps().dataSaver === true;
/** Can this shell measure the data actually used (the Android app)? */
export const canMeasure = () => caps().traffic === true;

export const isDataSaver = () => on;

export const currentPicture = () => picture;

function tellQuality() {
  if (caps().quality !== true) return;
  fetch(`https://localhost/__quality?floor=${FLOOR[picture]}`, { cache: 'no-store' }).catch(() => {});
}

function tellNative() {
  if (!canCapVideo()) return;
  fetch(`https://localhost/__datasaver?on=${on ? 1 : 0}`, { cache: 'no-store' }).catch(() => {});
  tellQuality();
}

/**
 * The player is loading a new server or episode: its quality menu is new, so
 * the Android app should apply the setting to it again.
 */
export const announcePlayerSource = () => tellQuality();

export function setPicture(next: Picture): void {
  picture = next;
  on = next === 'saver';
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
    if (!on) localStorage.setItem(PICTURE_KEY, next);
  } catch { /* holds for this session */ }
  tellNative();
  window.dispatchEvent(new Event(EVENT));
}

export function setDataSaver(next: boolean): void {
  let back: Picture = 'best';
  /* Data Saver off always returns to Best. */
  setPicture(next ? 'saver' : back);
}

export function usePicture(): [Picture, (p: Picture) => void] {
  const [v, setV] = useState(picture);
  useEffect(() => {
    const sync = () => setV(picture);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return [v, setPicture];
}

// The Android shell forgets the switch when it restarts; tell it again as soon
// as it announces itself, and once more on load in case that already happened.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('sahrae:caps', tellNative);
  setTimeout(tellNative, 0);
}

export function useDataSaver(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(on);
  useEffect(() => {
    const sync = () => setV(on);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return [v, setDataSaver];
}

/**
 * Rates used for estimates, in megabits per second. Assumptions, stated in the
 * UI as estimates: these players adapt to the connection, and the providers
 * publish nothing. 1.5 Mb/s is a typical 480p stream, 5 Mb/s a typical 1080p.
 */
export const SD_MBPS = 1.5;
export const HD_MBPS = 5;
/** A typical 720p stream: the least the HD setting will play. */
export const HD_MIN_MBPS = 3;

/** Gigabytes for `minutes` of video at `mbps`. */
export const gbFor = (minutes: number, mbps: number) => (mbps * 60 * minutes) / 8 / 1000;

export function formatGB(gb: number): string {
  if (gb < 1) return `${Math.max(10, Math.round((gb * 1000) / 10) * 10)} MB`;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1e6) return `${Math.max(0, Math.round(bytes / 1e3))} KB`;
  if (bytes < 1e9) return `${Math.round(bytes / 1e6)} MB`;
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

/**
 * What a viewing of `minutes` will cost, in words. With Data Saver on in the
 * Android app the cap makes it one figure; otherwise it is a range, because the
 * player picks the quality.
 */
export function estimateText(minutes: number, saver: boolean, capped: boolean, pic: Picture = saver ? 'saver' : 'hd'): string | null {
  if (!minutes || minutes <= 0) return null;
  const sd = formatGB(gbFor(minutes, SD_MBPS));
  const hd = formatGB(gbFor(minutes, HD_MBPS));
  if (saver && capped) return `About ${sd} with Data Saver`;
  if (capped && pic === 'best') return `About ${hd} in full HD`;
  if (capped && pic === 'hd') return `About ${formatGB(gbFor(minutes, HD_MIN_MBPS))} to ${hd} in HD`;
  return `About ${sd} to ${hd} of data`;
}

/** Bytes this app has received so far (Android app), or null where it cannot be measured. */
export async function readReceivedBytes(): Promise<number | null> {
  if (!canMeasure()) return null;
  try {
    const r = await fetch('https://localhost/__traffic', { cache: 'no-store' });
    const j = await r.json();
    return typeof j.rx === 'number' && j.rx >= 0 ? j.rx : null;
  } catch { return null; }
}
