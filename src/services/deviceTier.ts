/**
 * Lite mode: what the app does on a phone that cannot afford the full one.
 *
 * Why this exists. On a 3 GB Android phone (a Nokia C32, Android's low-memory
 * configuration) Sahrae installed and started, then Android killed its renderer
 * over and over: the home screen asks for a full-resolution backdrop plus a
 * hundred posters, and the decoded bitmaps alone run to hundreds of megabytes.
 * A renderer that exceeds its share is killed, the app reloads, and it happens
 * again — which is what "the app closes by itself" looked like from outside.
 *
 * Lite mode is not a different app. It is the same screens with the artwork
 * asked for at a size the phone can hold, and the expensive decoration off.
 *
 * It turns on when any of these is true:
 *   - the Android shell measured the device as low-RAM and set the flag
 *   - the renderer has already been killed here for memory
 *   - the browser reports 4 GB or less (`navigator.deviceMemory`, rounded down
 *     to a power of two, so a 3 GB phone reports 4 and a 6 GB one reports 4 too;
 *     both are better served by smaller images than by a reload loop)
 */

export const LITE_KEY = 'sahrae.lite.v1';

let cached: boolean | null = null;

export function isLiteDevice(): boolean {
  if (cached !== null) return cached;
  let lite = false;
  try {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('lite')) lite = true;
    if (!lite && localStorage.getItem(LITE_KEY) === '1') lite = true;
  } catch { /* storage unavailable */ }
  if (!lite) {
    try {
      const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      if (typeof mem === 'number' && mem > 0 && mem <= 4) lite = true;
    } catch { /* not supported: assume a capable device */ }
  }
  cached = lite;
  return lite;
}

/** Called by the Android shell, and after a memory-related renderer loss. */
export function markLiteDevice(): void {
  cached = true;
  try { localStorage.setItem(LITE_KEY, '1'); } catch { /* storage unavailable */ }
  try { document.documentElement.classList.add('lite'); } catch { /* no document */ }
}

/** Stamp the class so CSS can drop the expensive decoration. */
export function applyDeviceTier(): boolean {
  if (typeof document === 'undefined') return false;
  const lite = isLiteDevice();
  document.documentElement.classList.toggle('lite', lite);
  // Blur and the ambient glow field are the two costliest effects; `low-gfx`
  // already turns both off, so lite implies it.
  if (lite) document.documentElement.classList.add('low-gfx');
  return lite;
}

/** For tests: forget what was measured. */
export function resetDeviceTier(): void { cached = null; }
