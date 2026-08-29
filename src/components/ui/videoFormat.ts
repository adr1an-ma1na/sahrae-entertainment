/**
 * Pure formatters for a video row.
 *
 * Separate from VideoCard.tsx because Node cannot strip JSX, so anything living
 * in the component file cannot be tested directly — the same reason
 * youtubeParse.ts exists beside youtube.ts. These three are read at a glance and
 * are easy to get subtly wrong ("1.0M views", "1 months ago", a runtime that
 * silently drops the hour), which is exactly why they are worth testing.
 */

/** 1_250_000 → "1.3M views". Compact the way YouTube compacts. */
export function compactViews(n?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '';
  if (n < 1000) return `${n} views`;
  // One decimal only while the number is small enough for it to mean something;
  // "46.2K" is noise, "1.2K" is not.
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K views`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M views`;
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B views`;
}

/** Epoch ms → "3 days ago". Clamps the future to "just now" rather than
 *  rendering a negative age when a clock is skewed. */
export function timeAgo(ms?: number, now = Date.now()): string {
  if (!ms) return '';
  const s = Math.max(0, (now - ms) / 1000);
  const units: [number, string][] = [
    [31_536_000, 'year'], [2_592_000, 'month'], [604_800, 'week'],
    [86_400, 'day'], [3600, 'hour'], [60, 'minute'],
  ];
  for (const [secs, label] of units) {
    const n = Math.floor(s / secs);
    if (n >= 1) return `${n} ${label}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

/** Seconds → the runtime badge YouTube burns into the corner of a thumbnail. */
export function runtime(sec: number): string {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
