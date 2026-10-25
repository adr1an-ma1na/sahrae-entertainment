/**
 * Choices for Sahrae's own film player (components/CleanPlayer.tsx), kept
 * pure so cleanstream-check.mjs can pin them.
 */

export interface Rendition { height: number; bitrate: number }

/**
 * Which rendition to open on: the tallest (and, at the same height, the
 * richest) the stream has, or with Data Saver the best at 480p or below. A
 * stream without heights is judged by bitrate. -1 when there is nothing to pick.
 */
export function pickLevel(levels: Rendition[], saver: boolean): number {
  if (!levels.length) return -1;
  const byQuality = (a: number, b: number) =>
    (levels[b].height || 0) - (levels[a].height || 0) || (levels[b].bitrate || 0) - (levels[a].bitrate || 0);
  const order = levels.map((_, i) => i).sort(byQuality);
  if (!saver) return order[0];
  const fits = order.find((i) => levels[i].height > 0 ? levels[i].height <= 480 : levels[i].bitrate <= 1_600_000);
  // Nothing small enough: the smallest there is.
  return fits ?? order[order.length - 1];
}

/** The label for what is on screen, from the picture's real height. */
export function heightLabel(h: number): string {
  if (h >= 2000) return '4K';
  if (h >= 1300) return '1440p';
  if (h >= 1000) return '1080p';
  if (h >= 700) return '720p';
  return `${h}p`;
}

/** The stream relay address for a playlist the film page asked for. */
export function relayUrl(m3u8: string, referer?: string | null): string {
  return `https://localhost/__hlsproxy?u=${encodeURIComponent(m3u8)}${referer ? `&r=${encodeURIComponent(referer)}` : ''}`;
}

/** Ask the Android app for a film page's stream. Null when it has none to give. */
export async function resolveFilmStream(embed: string, timeoutMs = 30000): Promise<{ m3u8: string; referer: string | null } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://localhost/__filmstream?u=${encodeURIComponent(embed)}`, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { m3u8?: string | null; referer?: string | null };
    return j && typeof j.m3u8 === 'string' && j.m3u8.startsWith('http') ? { m3u8: j.m3u8, referer: j.referer ?? null } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** True in an Android app build that can hand over film streams. */
export function canPlayClean(): boolean {
  return (window as unknown as { __sahraeCaps?: { filmStream?: boolean } }).__sahraeCaps?.filmStream === true;
}

/**
 * Server order for Sahrae's own player: highest measured bitrate first. With
 * the adverts gone, the clearest picture is the only thing left to choose by
 * (2026-10-25 on Matlock: VidRock 1080p at 5 Mb/s, VidZee 1080p at 3 Mb/s,
 * VidLink 1080p at 1.6 Mb/s). Ties keep the pool's order.
 */
export function cleanFirst<T extends { visual: { mbps: number } }>(pool: T[]): T[] {
  return pool.map((s, i) => ({ s, i }))
    .sort((a, b) => (b.s.visual.mbps || 0) - (a.s.visual.mbps || 0) || a.i - b.i)
    .map((x) => x.s);
}

const CLEAN_KEY = 'sahrae.cleanPlayer.v1';
/** Sahrae's own player is on unless the viewer turned it off. */
export function isCleanOn(): boolean {
  try { return localStorage.getItem(CLEAN_KEY) !== '0'; } catch { return true; }
}
export function setCleanOn(on: boolean) {
  try { localStorage.setItem(CLEAN_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}
