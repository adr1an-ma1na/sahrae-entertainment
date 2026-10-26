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

/** Ask the Android app for a film page's stream. The app answers at once with
 *  {pending} while its hidden page looks (newer builds) or with the answer
 *  (older ones); either way this asks again every second until there is one.
 *  `why` says what went wrong, for the player panel and the test run. */
export async function resolveFilmStream(embed: string, timeoutMs = 35000): Promise<{ m3u8: string | null; referer: string | null; why?: string; ms: number }> {
  const t0 = Date.now();
  const url = `https://localhost/__filmstream?u=${encodeURIComponent(embed)}`;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return { m3u8: null, referer: null, why: `the app answered ${r.status}`, ms: Date.now() - t0 };
      const j = (await r.json()) as { m3u8?: string | null; referer?: string | null; pending?: boolean; why?: string };
      if (j.pending) { await new Promise((res) => setTimeout(res, 1000)); continue; }
      if (typeof j.m3u8 === 'string' && j.m3u8.startsWith('http')) return { m3u8: j.m3u8, referer: j.referer ?? null, ms: Date.now() - t0 };
      return { m3u8: null, referer: null, why: j.why || 'the page asked for no stream', ms: Date.now() - t0 };
    } catch (e) {
      return { m3u8: null, referer: null, why: `could not ask the app (${String(e).slice(0, 60)})`, ms: Date.now() - t0 };
    }
  }
  return { m3u8: null, referer: null, why: 'no answer within 35 s', ms: Date.now() - t0 };
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

export type PictureSetting = 'saver' | 'hd' | 'best';

/**
 * How Sahrae's player holds the Picture setting, given the stream's renditions:
 *   best   open on the sharpest and stay there (lock), whatever the line does
 *   hd     open on the sharpest; the player may step down on a slow line, but
 *          never below 720p (minBitrate = the smallest 720p-or-better rendition)
 *   saver  the best at 480p or below, and no higher (cap)
 * Indexes refer to the stream's own list. Viewers saw 480p on "1080p" servers
 * because nothing held the quality up.
 */
export function pictureRule(levels: Rendition[], picture: PictureSetting, allow4k = false): { start: number; lock: boolean; cap: number; minBitrate: number } {
  // VidFast offers 2160p at 16 Mb/s: locking a phone onto that stalls it. Best
  // means the sharpest up to 1080p there; a TV may climb to 4K when the line
  // allows, and never drops below 1080p.
  const upTo1080 = levels.map((l, i) => ({ l, i })).filter((x) => !x.l.height || x.l.height <= 1080);
  if (picture === 'best' && levels.some((l) => l.height > 1080) && upTo1080.length) {
    const sub = pickLevel(upTo1080.map((x) => x.l), false);
    const start = upTo1080[sub].i;
    if (!allow4k) return { start, lock: true, cap: -1, minBitrate: 0 };
    return { start, lock: false, cap: -1, minBitrate: levels[start].bitrate || 0 };
  }
  const start = pickLevel(levels, picture === 'saver');
  if (start < 0) return { start: -1, lock: false, cap: -1, minBitrate: 0 };
  if (picture === 'saver') return { start, lock: false, cap: start, minBitrate: 0 };
  if (picture === 'best') return { start, lock: true, cap: -1, minBitrate: 0 };
  const hd = levels.filter((l) => l.height >= 720).map((l) => l.bitrate || 0).filter((b) => b > 0);
  return { start, lock: false, cap: -1, minBitrate: hd.length ? Math.min(...hd) : 0 };
}
