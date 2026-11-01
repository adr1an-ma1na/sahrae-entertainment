/**
 * A catalogue song (Deezer) → the YouTube audio that plays it.
 *
 * Tried in order: the answer kept from before; YouTube Music's song search
 * through Piped (free); and, only for a song about to play, the official API
 * (whose answers every listener shares, ytDataApi). Background matching of a
 * whole mix never spends the official allowance. A match must be the same
 * song: title words, artist and length (curate.bestMatch), never a cover,
 * karaoke or sped-up edit.
 */
import { ytmusic, dominantColor, type Track } from './ytmusic';
import { bestMatch, type CTrack } from './curate';
import { isMusicTrack } from './musicFilter';

const KEY = 'sahrae.music.yt.v1';
const MAX = 3000;
const MISS_RETRY_MS = 86_400_000;
type Kept = Record<string, { y: string; at: number }>;

const keyOf = (t: { artist: string; title: string }) => `${t.artist}|${t.title}`.toLowerCase();
let kept: Kept | null = null;
function load(): Kept {
  if (kept) return kept;
  try { kept = JSON.parse(localStorage.getItem(KEY) || '{}') as Kept; } catch { kept = {}; }
  return kept!;
}
function remember(k: string, y: string) {
  const m = load();
  m[k] = { y, at: Date.now() };
  const ks = Object.keys(m);
  if (ks.length > MAX) ks.sort((a, b) => m[a].at - m[b].at).slice(0, ks.length - MAX).forEach((x) => delete m[x]);
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage full: kept in memory */ }
}

/** A catalogue song as a Sauti track: its YouTube id once matched, or `dz:<id>` until then. */
export function asTrack(c: CTrack, ytId?: string): Track {
  const id = ytId || `dz:${c.id}`;
  return {
    id, title: c.title, artist: c.artist, duration: c.duration,
    artwork: c.cover, artworkLarge: c.coverXl || c.cover, dominantColor: dominantColor(String(c.id)),
    dz: { id: c.id, artistId: c.artistId },
  } as Track;
}

/** What is already known for this song: a YouTube id, `null` for "no match found recently", undefined if never tried. */
export function knownMatch(c: { artist: string; title: string }): string | null | undefined {
  const hit = load()[keyOf(c)];
  if (!hit) return undefined;
  if (hit.y) return hit.y;
  return Date.now() - hit.at < MISS_RETRY_MS ? null : undefined;
}

const inflight = new Map<string, Promise<string | null>>();

/** The YouTube id for a song, or null. `paid` allows the official search (a song about to play). */
export function resolveYt(c: { title: string; artist: string; duration: number }, paid = false): Promise<string | null> {
  const k = keyOf(c);
  const known = knownMatch(c);
  if (known !== undefined && (known || !paid)) return Promise.resolve(known);
  const flightKey = `${k}|${paid}`;
  if (inflight.has(flightKey)) return inflight.get(flightKey)!;
  const job = (async () => {
    const q = `${c.artist} ${c.title}`;
    const pick = (list: Track[]) => bestMatch(c, list.filter(isMusicTrack).map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration })));
    let hit = pick(await ytmusic.searchSongsFree(q));
    if (!hit && paid) hit = pick(await ytmusic.search(q).catch(() => [] as Track[]));
    if (hit || paid) remember(k, hit?.id || '');
    return hit?.id || null;
  })().finally(() => inflight.delete(flightKey));
  inflight.set(flightKey, job);
  return job;
}

/** Match the songs of a list in the background, a few at a time, free route only. */
export async function prefetchMatches(list: { title: string; artist: string; duration: number }[], parallel = 3): Promise<void> {
  const todo = list.filter((c) => knownMatch(c) === undefined);
  let i = 0;
  const worker = async () => { while (i < todo.length) { const c = todo[i++]; await resolveYt(c).catch(() => null); } };
  await Promise.all(Array.from({ length: Math.min(parallel, todo.length) }, worker));
}
