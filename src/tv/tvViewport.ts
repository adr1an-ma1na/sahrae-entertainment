/**
 * Sahrae TV's screen size.
 *
 * A TV gives no way to zoom, so the TV app chooses its own. 100% is a full-HD
 * canvas, 1920 x 1080: the page is laid out 1920 px wide whatever the TV
 * reports, and the WebView fits it to the screen (the TV build sets
 * useWideViewPort and loadWithOverviewMode, .github/scripts/tv-variant.cjs).
 * That is the canvas TV apps are designed on (Netflix's included), and what a
 * website at 100% looks like on a 1080p screen.
 *
 * It used to be a share of the width the TV reports, and a Google TV reports
 * 960 px (1920 at device pixel ratio 2): even "90%" laid the page out about
 * 1,070 px wide, so everything looked about twice its desktop size (owner, TCL
 * C8L, 2026-11-01: "too zoomed in"). Sizes are kept under a new key, so the
 * old 90 is not read as the new 90.
 *
 * Above 100% is larger (fewer things on screen), below is smaller. The viewer
 * can change it in Profile, or from the phone remote's − / + (remote.ts).
 */
export const TV_ZOOMS = [75, 80, 90, 100, 110, 125, 150] as const;
export const TV_DEFAULT_ZOOM = 100;
/** The canvas width at 100%: full HD. */
export const TV_CANVAS_WIDTH = 1920;
const KEY = 'sahrae.tv.zoom.v2';

export const isTvBuild = (): boolean => {
  try { return (import.meta.env?.VITE_TARGET as string) === 'tv'; } catch { return false; }
};

/** The chosen size in percent, or the standard 100. */
export function tvZoom(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return (TV_ZOOMS as readonly number[]).includes(n) ? n : TV_DEFAULT_ZOOM;
  } catch { return TV_DEFAULT_ZOOM; }
}

/** The width to lay the page out at: 1920 at 100%, wider when smaller, narrower when larger. */
export function tvLayoutWidth(zoom: number): number {
  const z = zoom > 0 ? zoom : TV_DEFAULT_ZOOM;
  return Math.round((TV_CANVAS_WIDTH * 100) / z);
}

/** One step larger (+1) or smaller (-1) from `zoom`, stopping at the ends. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const list = TV_ZOOMS as readonly number[];
  let i = list.indexOf(zoom);
  if (i < 0) i = list.indexOf(TV_DEFAULT_ZOOM);
  return list[Math.max(0, Math.min(list.length - 1, i + dir))];
}

export function applyTvViewport(zoom = tvZoom()): void {
  try {
    if (!isTvBuild()) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    meta.content = `width=${tvLayoutWidth(zoom)}, user-scalable=no, viewport-fit=cover`;
  } catch { /* leave the page as it is */ }
}

export const TV_ZOOM_EVENT = 'sahrae:tvzoom';

/** Choose a size: kept for next time, applied now, and announced (Profile shows it; the phone remote may set it). */
export function setTvZoom(zoom: number): void {
  try { localStorage.setItem(KEY, String(zoom)); } catch { /* applied for this session only */ }
  applyTvViewport(zoom);
  try { window.dispatchEvent(new Event(TV_ZOOM_EVENT)); } catch { /* not in a browser */ }
}
