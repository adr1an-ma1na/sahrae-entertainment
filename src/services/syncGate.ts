/**
 * How the app's start waits for the library (App.tsx, cloudSync startSync).
 *
 * The intro waits up to SYNC_WAIT_MS for the first pull. A pull that brings a
 * newer library reloads the app once; a second one straight after that reload
 * is taken without reloading, so a clock or server mix-up can never loop.
 */
export const SYNC_WAIT_MS = 2000;
const KEY = 'sahrae.syncReloadAt';
const WINDOW_MS = 30_000;

export function syncReloadedRecently(now = Date.now()): boolean {
  try { return now - Number(sessionStorage.getItem(KEY) || 0) < WINDOW_MS; } catch { return false; }
}

export function markSyncReload(now = Date.now()): void {
  try { sessionStorage.setItem(KEY, String(now)); } catch { /* the window check then never fires */ }
}
