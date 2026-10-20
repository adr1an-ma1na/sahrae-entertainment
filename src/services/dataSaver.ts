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
 */

const KEY = 'sahrae.dataSaver.v1';
const EVENT = 'sahrae:datasaver';

let on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked: off */ }

type Caps = { dataSaver?: boolean; traffic?: boolean };
const caps = (): Caps => (window as unknown as { __sahraeCaps?: Caps }).__sahraeCaps || {};

/** Can this shell cap video quality (the Android app)? */
export const canCapVideo = () => caps().dataSaver === true;
/** Can this shell measure the data actually used (the Android app)? */
export const canMeasure = () => caps().traffic === true;

export const isDataSaver = () => on;

function tellNative() {
  if (!canCapVideo()) return;
  fetch(`https://localhost/__datasaver?on=${on ? 1 : 0}`, { cache: 'no-store' }).catch(() => {});
}

export function setDataSaver(next: boolean): void {
  on = next;
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* the switch still holds for this session */ }
  tellNative();
  window.dispatchEvent(new Event(EVENT));
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
export function estimateText(minutes: number, saver: boolean, capped: boolean): string | null {
  if (!minutes || minutes <= 0) return null;
  const sd = formatGB(gbFor(minutes, SD_MBPS));
  if (saver && capped) return `About ${sd} with Data Saver`;
  return `About ${sd} to ${formatGB(gbFor(minutes, HD_MBPS))} of data`;
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
