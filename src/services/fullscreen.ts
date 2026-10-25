/**
 * Full-screen helpers shared by the movie, series and sports players.
 */

/** Turn a phone to landscape once the player is full screen. Browsers that do
 *  not allow it (desktop, iPhone) refuse quietly. */
export function lockLandscape(): void {
  try {
    const o = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
    o?.lock?.('landscape')?.catch?.(() => {});
  } catch { /* not supported */ }
}

export function unlockOrientation(): void {
  try {
    const o = (screen as unknown as { orientation?: { unlock?: () => void } }).orientation;
    o?.unlock?.();
  } catch { /* not supported */ }
}
