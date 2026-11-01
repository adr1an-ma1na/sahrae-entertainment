/**
 * Deezer's public catalogue: artists, their photos, related artists, top
 * songs, genres and playlists. Free, no key, no daily allowance; used for
 * curation only (what to play). The audio itself comes from YouTube
 * (resolveYt.ts).
 *
 * Deezer's API sends no Access-Control-Allow-Origin, so a browser cannot fetch
 * it; it does answer JSONP (?output=jsonp), which loads as a script and works
 * on the web build and in the app's WebView alike. Answers are kept, in memory
 * and on the device, so a page of artists costs nothing the second time.
 */
import type { CArtist, CTrack } from './curate';

const API = 'https://api.deezer.com';
const PREFIX = 'sahrae.dz.';
const MAX_KEPT = 220;
const DAY = 86_400_000;

const slots = window as unknown as Record<string, unknown>;
let seq = 0;
const memory = new Map<string, unknown>();

// Deezer allows about 50 requests in 5 seconds from one address: never more than
// four at once, and no more than 40 started in any 5 seconds.
let active = 0;
const waiting: (() => void)[] = [];
const started: number[] = [];
async function paced(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (started.length && now - started[0] > 5000) started.shift();
    if (started.length < 40) { started.push(now); return; }
    await new Promise((r) => setTimeout(r, 5000 - (now - started[0]) + 20));
  }
}
// What the listener just asked for (a search, a pick's related artists) goes to the
// front of the line, ahead of photos being looked up in the background.
async function slot(urgent = false): Promise<() => void> {
  if (active >= 4) await new Promise<void>((r) => (urgent ? waiting.unshift(r) : waiting.push(r)));
  active++;
  await paced();
  return () => { active--; waiting.shift()?.(); };
}

// Deezer sometimes takes over ten seconds to answer a browser (13.5 s measured on
// 2026-11-01); a late answer is still kept for next time (see jsonpNow).
async function jsonp<T>(path: string, timeoutMs = 25_000, urgent = false): Promise<T> {
  const release = await slot(urgent);
  try { return await jsonpNow<T>(path, timeoutMs); } finally { release(); }
}

function jsonpNow<T>(path: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `__sahraeDz${Date.now().toString(36)}${seq++}`;
    const s = document.createElement('script');
    let timer = 0;
    const done = () => { try { delete slots[cb]; } catch { slots[cb] = undefined; } s.remove(); window.clearTimeout(timer); };
    let late = false;
    slots[cb] = (data: T) => {
      // Too late for this request, not for the next one: keep it.
      if (late) { memory.set(path, data); keep(path, data); try { delete slots[cb]; } catch { slots[cb] = undefined; } s.remove(); return; }
      done(); resolve(data);
    };
    s.onerror = () => { done(); reject(new Error('deezer unreachable')); };
    timer = window.setTimeout(() => { late = true; reject(new Error('deezer timeout')); }, timeoutMs);
    s.src = `${API}${path}${path.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
    s.async = true;
    document.head.appendChild(s);
  });
}

/** A Deezer answer, kept for `ttl`; a stale copy is used when Deezer cannot be reached. */
async function get<T>(path: string, ttl: number, urgent = false): Promise<T> {
  if (memory.has(path)) return memory.get(path) as T;
  let stale: T | undefined;
  try {
    const kept = JSON.parse(localStorage.getItem(PREFIX + path) || 'null') as { at: number; data: T } | null;
    if (kept && Date.now() - kept.at < ttl) { memory.set(path, kept.data); return kept.data; }
    if (kept) stale = kept.data;
  } catch { /* nothing kept */ }
  try {
    const data = await jsonp<T & { error?: unknown }>(path, 25_000, urgent);
    if ((data as { error?: unknown })?.error) throw new Error('deezer error');
    memory.set(path, data);
    keep(path, data);
    return data;
  } catch (e) {
    if (stale !== undefined) return stale;
    throw e;
  }
}

function keep(path: string, data: unknown) {
  try {
    localStorage.setItem(PREFIX + path, JSON.stringify({ at: Date.now(), data }));
    // A bounded set: the oldest answers go first.
    const keys: { k: string; at: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) { try { keys.push({ k, at: JSON.parse(localStorage.getItem(k) || '{}').at || 0 }); } catch { keys.push({ k, at: 0 }); } }
    }
    if (keys.length > MAX_KEPT) keys.sort((a, b) => a.at - b.at).slice(0, keys.length - MAX_KEPT).forEach(({ k }) => localStorage.removeItem(k));
  } catch { /* storage full: memory still has it */ }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const artist = (a: any): CArtist => ({ id: a.id, name: a.name, picture: a.picture_xl || a.picture_big || a.picture_medium });
const track = (t: any): CTrack => ({
  id: t.id, title: t.title_short || t.title, artist: t.artist?.name || '', artistId: t.artist?.id || 0,
  duration: t.duration || 0, cover: t.album?.cover_medium, coverXl: t.album?.cover_xl || t.album?.cover_big, rank: t.rank,
});
// Not an artist: compilations, and joint credits Deezer files as artists of their
// own ("Oxlade, Fally Ipupa", "MASIDI & Fally Ipupa"). A real duo or band
// with "&" in its name (Mumford & Sons) has a following; a joint credit has next to none.
const real = (a: any) => a && a.id && a.name && !/various artists/i.test(a.name)
  && !/,|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/i.test(a.name)
  && !(/\s(&|x|and)\s/i.test(a.name) && (a.nb_fan ?? 0) < 5000);
/* eslint-enable @typescript-eslint/no-explicit-any */

type List<T> = { data?: T[] };

/** A release on the catalogue: album, EP or single. */
export interface DzAlbum { id: number; title: string; cover?: string; coverXl?: string; date: string; type: string; artist: string; artistId: number }

export const deezer = {
  searchArtists: async (q: string, limit = 24, urgent = false): Promise<CArtist[]> =>
    (await get<List<unknown>>(`/search/artist?q=${encodeURIComponent(q)}&limit=${limit}`, 7 * DAY, urgent)).data?.filter(real).map(artist) || [],
  /** The best-known artist by that name, or null. */
  artistByName: async (name: string): Promise<CArtist | null> => (await deezer.searchArtists(name, 1))[0] || null,
  related: async (id: number, limit = 12, urgent = false): Promise<CArtist[]> =>
    (await get<List<unknown>>(`/artist/${id}/related?limit=${limit}`, 14 * DAY, urgent)).data?.filter(real).map(artist) || [],
  topTracks: async (id: number, limit = 15): Promise<CTrack[]> =>
    (await get<List<unknown>>(`/artist/${id}/top?limit=${limit}`, 3 * DAY)).data?.map(track).filter((t) => t.duration >= 60) || [],
  chartArtists: async (limit = 40): Promise<CArtist[]> =>
    (await get<List<unknown>>(`/chart/0/artists?limit=${limit}`, DAY)).data?.filter(real).map(artist) || [],
  genreArtists: async (genreId: number): Promise<CArtist[]> =>
    (await get<List<unknown>>(`/genre/${genreId}/artists`, 7 * DAY)).data?.filter(real).map(artist) || [],
  /** Playlists for a search, the most complete first (editors' and long lists rise). */
  searchPlaylists: async (q: string, limit = 12): Promise<{ id: number; title: string; tracks: number; by: string; cover?: string }[]> => {
    const j = await get<List<{ id: number; title: string; nb_tracks: number; user?: { name?: string }; picture_xl?: string; picture_big?: string }>>(`/search/playlist?q=${encodeURIComponent(q)}&limit=${limit}`, 3 * DAY);
    return (j.data || []).map((p) => ({ id: p.id, title: p.title, tracks: p.nb_tracks, by: p.user?.name || '', cover: p.picture_xl || p.picture_big }))
      .sort((a, b) => Number(/deezer/i.test(b.by)) - Number(/deezer/i.test(a.by)) || b.tracks - a.tracks);
  },
  /** An artist's releases, newest first. */
  artistAlbums: async (a: CArtist, limit = 12): Promise<DzAlbum[]> => {
    const j = await get<List<{ id: number; title: string; cover_medium?: string; cover_xl?: string; cover_big?: string; release_date?: string; record_type?: string }>>(`/artist/${a.id}/albums?limit=${limit}`, DAY);
    return (j.data || []).map((x) => ({ id: x.id, title: x.title, cover: x.cover_medium, coverXl: x.cover_xl || x.cover_big, date: x.release_date || '', type: x.record_type || 'album', artist: a.name, artistId: a.id }))
      .sort((x, y) => y.date.localeCompare(x.date));
  },
  /** A release's songs, with its cover (the tracklist leaves it out). */
  albumTracks: async (id: number, cover?: { cover?: string; coverXl?: string }): Promise<CTrack[]> =>
    (await get<List<unknown>>(`/album/${id}/tracks?limit=60`, 7 * DAY)).data?.map(track)
      .map((t) => ({ ...t, cover: t.cover || cover?.cover, coverXl: t.coverXl || cover?.coverXl }))
      .filter((t) => t.duration >= 60) || [],
  playlistTracks: async (id: number, limit = 100): Promise<CTrack[]> =>
    (await get<List<unknown>>(`/playlist/${id}/tracks?limit=${limit}`, DAY)).data?.map(track).filter((t) => t.duration >= 60) || [],
};
