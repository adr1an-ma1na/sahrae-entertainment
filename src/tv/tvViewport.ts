/**
 * Sahrae TV's screen size.
 *
 * A TV gives no way to zoom, so the TV app chooses its own: the page is laid
 * out wider than the screen reports and the WebView fits it to the screen
 * (the TV build sets useWideViewPort and loadWithOverviewMode,
 * .github/scripts/tv-variant.cjs). 90% is the standard (owner, TCL C8L,
 * 2026-10-28: at 100% a Google TV's 960 px page looked zoomed in); the viewer
 * can pick another size in Profile.
 */
export const TV_ZOOMS = [70, 80, 90, 100] as const;
export const TV_DEFAULT_ZOOM = 90;
const KEY = 'sahrae.tv.zoom.v1';

export const isTvBuild = (): boolean => {
  try { return (import.meta.env?.VITE_TARGET as string) === 'tv'; } catch { return false; }
};

/** The chosen size in percent, or the standard 90. */
export function tvZoom(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return (TV_ZOOMS as readonly number[]).includes(n) ? n : TV_DEFAULT_ZOOM;
  } catch { return TV_DEFAULT_ZOOM; }
}

/** The width to lay the page out at for a screen `cssWidth` wide, or null at 100%. */
export function tvLayoutWidth(cssWidth: number, zoom: number): number | null {
  if (!(cssWidth > 0) || zoom >= 100 || zoom <= 0) return null;
  return Math.round((cssWidth * 100) / zoom);
}

// The screen's own width and the page's own viewport, read once before any change.
let screenWidth = 0;
let original = '';

export function applyTvViewport(zoom = tvZoom()): void {
  try {
    if (!isTvBuild()) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    if (!screenWidth) { screenWidth = window.innerWidth; original = meta.content; }
    const width = tvLayoutWidth(screenWidth, zoom);
    meta.content = width ? `width=${width}, user-scalable=no, viewport-fit=cover` : original;
  } catch { /* leave the page as it is */ }
}

/** Choose a size: kept for next time, applied now. */
export function setTvZoom(zoom: number): void {
  try { localStorage.setItem(KEY, String(zoom)); } catch { /* applied for this session only */ }
  applyTvViewport(zoom);
}
