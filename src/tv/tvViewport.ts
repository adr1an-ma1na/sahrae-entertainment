/**
 * Sahrae TV's page width.
 *
 * A 4K or 1080p Google TV usually runs its interface at 1920 x 1080 with double
 * density, so the app's WebView reports a page of 960 x 540: phone-landscape
 * size, which blown up across a 55" screen looked zoomed in, with no way to
 * zoom out (owner, TCL C8L, 2026-10-28). The TV app lays the page out at a
 * wider width instead and the WebView fits it to the screen (the TV build sets
 * useWideViewPort and loadWithOverviewMode, .github/scripts/tv-variant.cjs).
 */
export const TV_LAYOUT_WIDTH = 1536;

/** The width to lay the TV page out at, or null to leave it (already wide). */
export function tvLayoutWidth(cssWidth: number): number | null {
  return cssWidth > 0 && cssWidth < 1200 ? TV_LAYOUT_WIDTH : null;
}

export function applyTvViewport(): void {
  try {
    if ((import.meta.env?.VITE_TARGET as string) !== 'tv') return;
    const width = tvLayoutWidth(window.innerWidth);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!width || !meta) return;
    meta.content = `width=${width}, user-scalable=no, viewport-fit=cover`;
  } catch { /* leave the page as it is */ }
}
