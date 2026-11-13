/** The remote's seek and time display for TvTransport, kept apart so it can be tested. */

/** Seconds per Left/Right press: 10, and while the key is held, 30 then 60. */
export function seekStep(repeats: number): number {
  if (repeats >= 12) return 60;
  if (repeats >= 4) return 30;
  return 10;
}

/** 0:05, 5:39, 1:43:26 */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}
