/**
 * How much image a device should be asked to hold.
 *
 * Why this exists. On a 3 GB Android phone (a Nokia C32) Sahrae installed and
 * started, then Android killed its renderer over and over. The cause was not
 * the visual design: it was artwork. A decoded bitmap costs width × height × 4
 * bytes regardless of how small the JPEG was, and the app asked TMDB for
 * `original` backdrops — up to 3840 px wide, about 60 MB in memory each — on a
 * screen 720 px wide. Dozens of posters at w500 followed the same pattern.
 *
 * The fix is not to take features away. An image larger than the screen can
 * show is waste in every case, so the size is chosen from the screen instead:
 * on that phone a w780 backdrop fills the width exactly and looks identical to
 * the `original` it replaces, at a twentieth of the memory. A laptop still gets
 * the full-resolution artwork, because there it is visible.
 *
 * Nothing here removes glass, glow or motion. Those are dropped only by
 * `low-gfx`, which is set when the renderer has actually crashed on this
 * device — evidence, not a guess about the phone's taste.
 */

export const LITE_KEY = 'sahrae.lite.v1';

let cached: boolean | null = null;

/**
 * A memory-constrained device: the Android shell measured it, or its renderer
 * has already been lost here, or the browser reports 4 GB or less. It changes
 * one thing — off-screen rows are not painted — and nothing you can see.
 */
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

/**
 * The widest artwork worth fetching, in device pixels.
 *
 * It is the screen's WIDTH, not its longest edge: a full-bleed backdrop spans
 * the width, and a phone held upright is 720 CSS px across however tall it is.
 * Times the pixel ratio, capped at 2×, because beyond that the extra detail is
 * not resolvable at arm's length and the memory cost is real.
 */
export function screenPixels(): number {
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = Math.min(
      window.screen?.width || Number.POSITIVE_INFINITY,
      window.innerWidth || Number.POSITIVE_INFINITY,
    );
    const px = Number.isFinite(cssWidth) ? Math.round(cssWidth * dpr) : 0;
    return px > 0 ? px : 1920;
  } catch {
    return 1920; // unknown: assume a desktop and keep the full-fat artwork
  }
}

/** Stamp the class so off-screen rows can be skipped on a small device. */
export function applyDeviceTier(): boolean {
  if (typeof document === 'undefined') return false;
  const lite = isLiteDevice();
  document.documentElement.classList.toggle('lite', lite);
  return lite;
}

/** For tests: forget what was measured. */
export function resetDeviceTier(): void { cached = null; }
