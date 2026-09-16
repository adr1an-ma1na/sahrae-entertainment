/**
 * Which region a listener is in, for choosing local content.
 *
 * Order of evidence: what they last chose in the app, then the region in their
 * device language settings ("en-KE" → KE), then Kenya — the app's home market.
 * Only regions the caller actually has content for are ever returned, so a
 * French device does not ask for a French chart nobody curated.
 */

const SAVED_KEY = 'sahrae.music.chartRegion.v1';

export function listenerRegion(offered: string[], fallback = 'KE'): string {
  try {
    const saved = localStorage.getItem(SAVED_KEY);
    if (saved && offered.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  const langs = typeof navigator !== 'undefined'
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : [];
  for (const l of langs) {
    const region = String(l || '').split(/[-_]/)[1]?.toUpperCase();
    if (region && offered.includes(region)) return region;
  }
  return offered.includes(fallback) ? fallback : offered[0];
}

export function rememberRegion(region: string): void {
  try { localStorage.setItem(SAVED_KEY, region); } catch { /* storage unavailable */ }
}
