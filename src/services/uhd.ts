/**
 * Which server has a title in 4K (owner, 2026-11-20: "the server that has 4K
 * for the selected movie should start, to avoid users searching for it").
 *
 * No server can be asked beforehand: a server's picture sizes are known only
 * once its player has the stream. So Sahrae learns it. When a server's player
 * lists a 2160p (4K) size for a title (the Android apps read every server's
 * list; Sahrae's own player knows its stream), that is kept on the device and
 * told to everyone through the shared play log as a marker row
 * (`uhd<server>`, e.g. `uhdvidfast`, under the title's key and, for a series,
 * under `tv:<id>:0:0`), so the next viewer of the title starts on that server.
 * Pure apart from the device store; tested in uhd-check.mjs.
 */
export const UHD_MARK = 'uhd';
const LOCAL_KEY = 'sahrae.uhd.v1';
const MAX = 400;

/** The marker row for a server ("uhdvidfast"); fits the log's 20-character server ids. */
export const uhdMarker = (serverId: string) => `${UHD_MARK}${serverId}`.slice(0, 20);
/** A whole series' key: 4K on one episode is the likeliest sign of 4K on the others. */
export const seriesKey = (id: number) => `tv:${id}:0:0`;

/** A picture size of 4K or more: "2160p", "4K", "UHD", "3840x2160". */
export function isUhdLabel(label: string): boolean {
  const s = String(label || '');
  if (/\b(4k|uhd|8k)\b/i.test(s)) return true;
  // "2160p" and "2160p60" (the frame rate after it), not "2160px".
  const p = /(\d{3,4})\s*p(?!x)/i.exec(s);
  if (p && Number(p[1]) >= 2160) return true;
  const wh = /(\d{3,4})\s*[x×]\s*(\d{3,4})/.exec(s);
  return !!wh && Math.min(Number(wh[1]), Number(wh[2])) >= 2160;
}

/** Servers the shared log says have this title in 4K, most-confirmed first, only those offered. */
export function crowdUhd(rows: { server_id: string; ok_count: number }[], offered: string[]): string[] {
  return rows
    .filter((r) => r.server_id.startsWith(UHD_MARK) && r.ok_count > 0)
    .map((r) => ({ id: offered.find((o) => uhdMarker(o) === r.server_id), n: r.ok_count }))
    .filter((x): x is { id: string; n: number } => !!x.id)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.id);
}

type Kept = Record<string, { s: string; at: number }>;
const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
function read(): Kept { try { return JSON.parse(store()?.getItem(LOCAL_KEY) || '{}') as Kept; } catch { return {}; } }

/** The server this device saw the title (or the series) in 4K on, if it is still offered. */
export function localUhd(keys: string[], offered: string[]): string | null {
  const kept = read();
  for (const k of keys) { const hit = kept[k]; if (hit && offered.includes(hit.s)) return hit.s; }
  return null;
}

/** Remember it here. Returns true when it is news (so it is worth telling the crowd). */
export function keepUhd(keys: string[], serverId: string, now = Date.now()): boolean {
  const kept = read();
  let news = false;
  for (const k of keys) { if (kept[k]?.s !== serverId) news = true; kept[k] = { s: serverId, at: now }; }
  const all = Object.keys(kept);
  if (all.length > MAX) all.sort((a, b) => kept[a].at - kept[b].at).slice(0, all.length - MAX).forEach((k) => delete kept[k]);
  try { store()?.setItem(LOCAL_KEY, JSON.stringify(kept)); } catch { /* this visit only */ }
  return news;
}

/** The keys a title's 4K is kept under: the title (episode) itself, and the series. */
export function uhdKeys(type: 'movie' | 'tv', id: number, episodeKey: string): string[] {
  return type === 'tv' ? [episodeKey, seriesKey(id)] : [episodeKey];
}
