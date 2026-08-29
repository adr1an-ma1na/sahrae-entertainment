import type { Track, Artist, Album } from './ytmusic';
import { parseISODuration, dominantColor } from './youtubeParse';

/**
 * Official YouTube Data API v3 client — the music catalog behind Sauti.
 *
 * This replaces Piped as the primary source. Piped is a network of volunteer
 * YouTube-frontend proxies; when this was written 4 of the 5 instances the app
 * ships answered 502/301/timeout, which is why Music felt broken. This talks to
 * Google directly, so it is up whenever YouTube is up, and it returns YouTube's
 * own data rather than a scrape of it.
 *
 * QUOTA is the one real constraint, and it drives the whole design:
 *   videos.list / playlistItems.list / channels.list  →   1 unit
 *   search.list                                       → 100 unit
 * The default allowance is 10,000 units/day for the whole project (all users
 * combined), so search is ~95 calls/day and everything else is effectively free.
 * Therefore:
 *   - Browse, charts and shelves are built from videos.list?chart=mostPopular,
 *     at 1 unit per country. This is also better data — YouTube's actual music
 *     chart for that region, updated by Google, instead of the old approach of
 *     searching the literal string "kenya trending songs 2026" and hoping.
 *   - search.list is used only for a typed query, is cached hard, and once the
 *     day's budget is spent the caller falls back to Piped rather than failing.
 *
 * relatedToVideoId was REMOVED from the API (confirmed against the live
 * discovery document — the parameter no longer exists), so "song radio" cannot
 * be built from it any more; ytmusic.related() handles that separately.
 *
 * Playback is unchanged: Google's IFrame player, driven by videoId. Nothing is
 * extracted or re-hosted.
 */

import firebaseConfig from '../../firebase-applet-config.json';

const API_KEY: string = (import.meta.env?.VITE_YOUTUBE_API_KEY as string) || firebaseConfig.apiKey;
const BASE = 'https://www.googleapis.com/youtube/v3';

// ── Quota budget ───────────────────────────────────────────────────────────
const QUOTA_KEY = 'sahrae.yt.quota.v1';
const DAILY_UNITS = 10000;
// Leave headroom so cheap browse calls still work after search has been used
// heavily — running the tank to zero would break the home page, which is worse
// than degrading search to the fallback.
const SEARCH_BUDGET = 8000;
const COST = { search: 100, cheap: 1 };

function today(): string { return new Date().toISOString().slice(0, 10); }

function readQuota(): { day: string; used: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(QUOTA_KEY) || 'null');
    if (raw && raw.day === today()) return raw;
  } catch { /* fall through to a fresh budget */ }
  return { day: today(), used: 0 };
}
function spend(units: number): void {
  const q = readQuota();
  q.used += units;
  try { localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); } catch { /* ignore */ }
}
/** Units consumed today, for the diagnostics readout. */
export function quotaUsed(): number { return readQuota().used; }
export function quotaRemaining(): number { return Math.max(0, DAILY_UNITS - readQuota().used); }
/** Whether a paid search is still affordable today. */
export function canSearch(): boolean { return readQuota().used + COST.search <= SEARCH_BUDGET; }

// ── Availability ───────────────────────────────────────────────────────────
// The Data API must be switched on for the Cloud project. Until it is, every
// call 403s. One probe is enough to learn that — after which we stop calling and
// let the caller fall back, instead of firing a doomed request per shelf.
export type ApiState = 'unknown' | 'ok' | 'disabled' | 'keyBlocked' | 'quota';
let apiState: ApiState = 'unknown';
export function getApiState(): ApiState { return apiState; }
export function resetApiState(): void { apiState = 'unknown'; }
export const ENABLE_URL = `https://console.cloud.google.com/apis/library/youtube.googleapis.com?project=${firebaseConfig.projectId}`;
/** Where to lift an API-key restriction — a different page from enabling the API. */
export const CREDENTIALS_URL = `https://console.cloud.google.com/apis/credentials?project=${firebaseConfig.projectId}`;

// ── Response cache ─────────────────────────────────────────────────────────
// Charts move slowly and a listener revisits the same shelves constantly, so
// caching is what keeps the day's quota intact across a session.
const TTL = { chart: 6 * 3600_000, search: 24 * 3600_000, playlist: 12 * 3600_000 };
const mem = new Map<string, { at: number; data: unknown }>();
const CACHE_PREFIX = 'sahrae.yt.cache.';

function cacheGet<T>(key: string, ttl: number): T | null {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null');
    if (raw && Date.now() - raw.at < ttl) { mem.set(key, raw); return raw.data as T; }
  } catch { /* ignore a corrupt entry */ }
  return null;
}
function cacheSet(key: string, data: unknown): void {
  const rec = { at: Date.now(), data };
  mem.set(key, rec);
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(rec)); } catch { /* quota-full localStorage is survivable */ }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function get(path: string, units: number): Promise<any | null> {
  if (!API_KEY || apiState === 'disabled') return null;
  const sep = path.includes('?') ? '&' : '?';
  try {
    const r = await fetch(`${BASE}/${path}${sep}key=${API_KEY}`);
    if (r.ok) { apiState = 'ok'; spend(units); return await r.json(); }
    const body = await r.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || '';
    // API_KEY_SERVICE_BLOCKED and SERVICE_DISABLED are both 403s whose human
    // message says "blocked", but they have different fixes: one is the key's
    // allow-list, the other is the API's on/off switch.
    const detailReason = (body?.error?.details || [])
      .find((x: any) => x?.['@type']?.includes('ErrorInfo'))?.reason || '';
    if (r.status === 403 && detailReason === 'API_KEY_SERVICE_BLOCKED') {
      apiState = 'keyBlocked';
    } else if (r.status === 403 && (reason === 'accessNotConfigured' || detailReason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(body?.error?.message || ''))) {
      apiState = 'disabled';
    } else if (r.status === 403 && reason === 'quotaExceeded') {
      apiState = 'quota';
      // Mark the tank empty so nothing else tries today.
      try { localStorage.setItem(QUOTA_KEY, JSON.stringify({ day: today(), used: DAILY_UNITS })); } catch { /* ignore */ }
    }
  } catch { /* offline — the caller falls back */ }
  return null;
}

const hiRes = (th: any, id: string): string =>
  th?.maxres?.url || th?.standard?.url || th?.high?.url || th?.medium?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

const cleanArtist = (s: string): string => String(s || '').replace(/\s*-\s*Topic$/i, '').trim() || 'Unknown Artist';

/** A videos.list item already carries duration, so these need no second call. */
function mapVideo(v: any): Track | null {
  const id = v.id?.videoId || v.id;
  if (!id || typeof id !== 'string') return null;
  const s = v.snippet || {};
  const dur = parseISODuration(v.contentDetails?.duration);
  return {
    id,
    title: String(s.title || 'Unknown'),
    artist: cleanArtist(s.videoOwnerChannelTitle || s.channelTitle),
    artwork: s.thumbnails?.medium?.url || s.thumbnails?.default?.url,
    artworkLarge: hiRes(s.thumbnails, id),
    duration: dur,
    dominantColor: dominantColor(id),
    channelId: s.channelId,
    date: s.publishedAt ? new Date(s.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : undefined,
    uploaded: s.publishedAt ? Date.parse(s.publishedAt) : 0,
  };
}

function mapMany(items: any[]): Track[] {
  const out: Track[] = [];
  const seen = new Set<string>();
  for (const it of items || []) {
    const t = mapVideo(it);
    if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
  }
  return out;
}

/** Songs run roughly 1–10 minutes. Filters out the hour-long DJ mixes and
 *  10-second Shorts that otherwise dominate a music chart. */
const isSongLength = (t: Track) => t.duration >= 60 && t.duration <= 900;

/** Fill in durations for items that came from search.list (which omits them). */
async function withDurations(tracks: Track[]): Promise<Track[]> {
  const need = tracks.filter((t) => !t.duration).map((t) => t.id);
  if (!need.length) return tracks;
  const byId = new Map<string, number>();
  for (let i = 0; i < need.length; i += 50) {
    const j = await get(`videos?part=contentDetails&id=${need.slice(i, i + 50).join(',')}`, COST.cheap);
    for (const v of j?.items || []) byId.set(v.id, parseISODuration(v.contentDetails?.duration));
  }
  return tracks.map((t) => (t.duration ? t : { ...t, duration: byId.get(t.id) ?? 0 }));
}

export const ytDataApi = {
  available: (): boolean => apiState !== 'disabled' && apiState !== 'keyBlocked' && !!API_KEY,

  /**
   * YouTube's real music chart for a region — 1 quota unit, and it carries
   * durations already. This is the backbone of the whole Music home.
   */
  chart: async (regionCode: string, max = 50): Promise<Track[] | null> => {
    const key = `chart.${regionCode}.${max}`;
    const hit = cacheGet<Track[]>(key, TTL.chart);
    if (hit) return hit;
    const j = await get(`videos?part=snippet,contentDetails&chart=mostPopular&videoCategoryId=10&regionCode=${encodeURIComponent(regionCode)}&maxResults=${Math.min(max, 50)}`, COST.cheap);
    if (!j) return null;
    const out = mapMany(j.items).filter(isSongLength);
    cacheSet(key, out);
    return out;
  },

  /** Typed search. 100 units, so it is cached for a day and budget-gated. */
  search: async (q: string, kind: 'song' | 'video' = 'song'): Promise<Track[] | null> => {
    const query = q.trim();
    if (!query) return [];
    const key = `search.${kind}.${query.toLowerCase()}`;
    const hit = cacheGet<Track[]>(key, TTL.search);
    if (hit) return hit;
    if (!canSearch()) return null; // out of budget → caller falls back
    const cat = kind === 'song' ? '&videoCategoryId=10' : '';
    const j = await get(`search?part=snippet&type=video${cat}&maxResults=25&q=${encodeURIComponent(query)}`, COST.search);
    if (!j) return null;
    let out = await withDurations(mapMany(j.items));
    if (kind === 'song') out = out.filter(isSongLength);
    cacheSet(key, out);
    return out;
  },

  /** Any public playlist — albums (OLAK5uy_…), curated lists, channel uploads. */
  playlistTracks: async (playlistId: string, cap = 100): Promise<Track[] | null> => {
    const key = `pl.${playlistId}.${cap}`;
    const hit = cacheGet<Track[]>(key, TTL.playlist);
    if (hit) return hit;
    const items: any[] = [];
    let pageToken = '';
    do {
      const j = await get(`playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`, COST.cheap);
      if (!j) return items.length ? mapMany(items) : null;
      items.push(...(j.items || []));
      pageToken = j.nextPageToken || '';
    } while (pageToken && items.length < cap);

    // playlistItems nests the video id differently and omits duration.
    const tracks = items
      .filter((it) => it.snippet?.resourceId?.videoId && !/^(Deleted|Private|Unavailable) video$/.test(it.snippet?.title || ''))
      .map((it) => mapVideo({ id: it.snippet.resourceId.videoId, snippet: it.snippet }))
      .filter((t): t is Track => !!t);
    const out = await withDurations(tracks);
    cacheSet(key, out);
    return out;
  },

  searchArtists: async (q: string): Promise<Artist[] | null> => {
    const key = `artists.${q.trim().toLowerCase()}`;
    const hit = cacheGet<Artist[]>(key, TTL.search);
    if (hit) return hit;
    if (!canSearch()) return null;
    const j = await get(`search?part=snippet&type=channel&maxResults=12&q=${encodeURIComponent(q)}`, COST.search);
    if (!j) return null;
    const out: Artist[] = (j.items || [])
      .map((it: any) => ({
        id: it.id?.channelId,
        name: cleanArtist(it.snippet?.title),
        thumbnail: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.default?.url,
      }))
      .filter((a: Artist) => a.id);
    cacheSet(key, out);
    return out;
  },

  searchAlbums: async (q: string): Promise<Album[] | null> => {
    const key = `albums.${q.trim().toLowerCase()}`;
    const hit = cacheGet<Album[]>(key, TTL.search);
    if (hit) return hit;
    if (!canSearch()) return null;
    const j = await get(`search?part=snippet&type=playlist&maxResults=12&q=${encodeURIComponent(q)}`, COST.search);
    if (!j) return null;
    const out: Album[] = (j.items || [])
      .map((it: any) => ({
        id: it.id?.playlistId,
        name: String(it.snippet?.title || 'Album'),
        thumbnail: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.default?.url,
        artist: cleanArtist(it.snippet?.channelTitle),
      }))
      .filter((a: Album) => a.id);
    cacheSet(key, out);
    return out;
  },

  /** A channel's uploads — an artist's catalogue. The uploads playlist id is the
   *  channel id with its second character changed from C to U. */
  channelUploads: async (channelId: string, cap = 50): Promise<Track[] | null> => {
    if (!/^UC/.test(channelId)) return null;
    return ytDataApi.playlistTracks('UU' + channelId.slice(2), cap);
  },

  /** One video's metadata — 1 unit. Used to learn a seed track's channel. */
  videoInfo: async (videoId: string): Promise<Track | null> => {
    const key = `vid.${videoId}`;
    const hit = cacheGet<Track>(key, TTL.playlist);
    if (hit) return hit;
    const j = await get(`videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}`, COST.cheap);
    const t = j?.items?.[0] ? mapVideo(j.items[0]) : null;
    if (t) cacheSet(key, t);
    return t;
  },

  /**
   * Song radio. The API removed relatedToVideoId, so this is built from the
   * seed's own artist channel (2 units) and topped up from the regional chart
   * — rather than burning 100 units on a search for every autoplay.
   */
  radio: async (videoId: string, regionCode = 'US'): Promise<Track[] | null> => {
    const seed = await ytDataApi.videoInfo(videoId);
    if (!seed) return null;

    const out: Track[] = [];
    const seen = new Set<string>([videoId]);
    const push = (list: Track[] | null) => {
      for (const t of list || []) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    };

    if (seed.channelId) push(await ytDataApi.channelUploads(seed.channelId, 50));
    if (out.length < 15) push(await ytDataApi.chart(regionCode, 50));
    return out.filter(isSongLength).slice(0, 50);
  },
};

/* eslint-enable @typescript-eslint/no-explicit-any */
