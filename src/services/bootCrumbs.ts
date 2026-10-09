import { Capacitor } from '@capacitor/core';

/**
 * Breadcrumbs for the Android shell: which screen the app is on and how much
 * JavaScript memory it holds. When the screen engine dies the shell attaches the
 * last few to the report it shows, so a failure on a real phone says where it
 * happened instead of leaving it to be guessed. Native only, fire-and-forget.
 */
const native = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

function heapMb(): number | null {
  try {
    const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return m ? Math.round(m.usedJSHeapSize / 1e6) : null;
  } catch { return null; }
}

export function crumb(stage: string): void {
  if (!native) return;
  try {
    const h = heapMb();
    const q = `s=${encodeURIComponent(stage.slice(0, 60))}${h !== null ? `&h=${h}` : ''}`;
    fetch(`https://localhost/__crumb?${q}`, { cache: 'no-store' }).catch(() => {});
  } catch { /* never let reporting break the app */ }
}

let ticking = false;

/** One crumb every 10 s while the app is on screen, so memory growth shows up. */
export function startHeartbeat(): void {
  if (!native || ticking) return;
  ticking = true;
  setInterval(() => { if (!document.hidden) crumb('tick'); }, 10_000);
}
