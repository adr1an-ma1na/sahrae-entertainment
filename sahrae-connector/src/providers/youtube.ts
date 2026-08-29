import { beginAuth, disconnect as dropToken, providerFetch } from '../auth/oauthClient.ts';
import { isConnected as tokenConnected } from '../auth/tokenStore.ts';
import { sahraeId, type PlaybackAction, type SahraeArtwork, type SahraePlaylist, type SahraePlaylistSummary, type SahraeTrack } from '../types/index.ts';
import { ProviderError, type ProviderAdapter } from './types.ts';

/**
 * YouTube Data API v3 adapter.
 *
 * Read + hand off. Tier 1 resolves to the YouTube app via an intent-style URI,
 * falling back to watch?v=. No audio is extracted — that is out of scope by
 * constraint, and it is also the thing that gets an app pulled.
 *
 * QUOTA: search.list costs 100 units against a 10,000/day project allowance;
 * playlistItems.list and videos.list cost 1. So library and playlist reads are
 * effectively free and search is the expensive call — which is why searchTracks
 * caps at 25 and nothing here searches speculatively.
 */

const API = 'https://www.googleapis.com/youtube/v3';
const ID: 'youtube' = 'youtube';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Tombstones YouTube leaves in playlists where an entry was removed. */
const TOMBSTONES = new Set(['Deleted video', 'Private video', 'Unavailable video']);

/** ISO-8601 duration (PT1H2M10S) → milliseconds. */
export function isoDurationToMs(iso: string | undefined): number {
  const m = /^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [, d, h, mi, s] = m;
  return Math.round(
    (Number(d || 0) * 86400 + Number(h || 0) * 3600 + Number(mi || 0) * 60 + Number(s || 0)) * 1000,
  );
}

function thumbs(t: any): SahraeArtwork[] {
  if (!t) return [];
  return ['maxres', 'standard', 'high', 'medium', 'default']
    .map((k) => t[k])
    .filter((x) => x?.url)
    .map((x) => ({ url: x.url, width: x.width || undefined, height: x.height || undefined }));
}

/** "Artist - Topic" is how YouTube labels auto-generated artist channels. */
const cleanChannel = (s: string): string => String(s || '').replace(/\s*-\s*Topic$/i, '').trim();

export function toSahraeTrack(videoId: string, snippet: any, durationMs = 0, addedAt?: string): SahraeTrack | null {
  if (!videoId || !snippet) return null;
  const title = String(snippet.title || '');
  if (TOMBSTONES.has(title)) return null;

  const channel = cleanChannel(snippet.videoOwnerChannelTitle || snippet.channelTitle);
  return {
    id: sahraeId(ID, videoId),
    provider: ID,
    providerId: videoId,
    title: title || 'Unknown',
    artists: [channel || 'YouTube'],
    durationMs,
    artwork: thumbs(snippet.thumbnails),
    addedAt: addedAt ? Date.parse(addedAt) || undefined : undefined,
    playback: {
      tier: 1,
      // vnd.youtube: is the scheme the YouTube app registers. Android also
      // resolves the https watch URL to the app via App Links, so the web URL
      // is a genuine fallback rather than a consolation prize.
      deepLink: `vnd.youtube:${videoId}`,
      webUrl: `https://www.youtube.com/watch?v=${videoId}`,
    },
  };
}

async function get(path: string): Promise<any> {
  const res = await providerFetch(ID, `${API}${path}`);
  if (res.status === 401) throw new ProviderError('YouTube session expired. Reconnect to continue.', ID, 401);
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || '';
    if (reason === 'quotaExceeded') {
      throw new ProviderError('YouTube API quota for today is used up. It resets at midnight Pacific.', ID, 403);
    }
    throw new ProviderError(
      body?.error?.message || 'YouTube refused the request. Check that YouTube Data API v3 is enabled on the Google Cloud project.',
      ID, 403,
    );
  }
  if (!res.ok) throw new ProviderError(`YouTube request failed (${res.status}).`, ID, res.status);
  return res.json();
}

/** Walk a paged list endpoint up to `cap` items. */
async function paged(path: string, cap: number): Promise<any[]> {
  const out: any[] = [];
  let pageToken = '';
  do {
    const j = await get(`${path}${path.includes('?') ? '&' : '?'}maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`);
    out.push(...(j.items || []));
    pageToken = j.nextPageToken || '';
  } while (pageToken && out.length < cap);
  return out.slice(0, cap);
}

/** Durations in batches of 50 — 1 quota unit per call regardless of count. */
async function durations(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50).filter(Boolean).join(',');
    if (!chunk) continue;
    try {
      const j = await get(`/videos?part=contentDetails&id=${chunk}`);
      for (const v of j.items || []) map.set(v.id, isoDurationToMs(v.contentDetails?.duration));
    } catch {
      // Durations are a nicety. Losing them must not lose the playlist.
    }
  }
  return map;
}

/** The user's own channel ids for liked videos / uploads. Cached: never changes. */
let relatedCache: { likes?: string; uploads?: string } | null = null;
async function relatedPlaylists(): Promise<{ likes?: string; uploads?: string }> {
  if (relatedCache) return relatedCache;
  const j = await get('/channels?part=contentDetails&mine=true');
  const r = j.items?.[0]?.contentDetails?.relatedPlaylists || {};
  relatedCache = { likes: r.likes, uploads: r.uploads };
  return relatedCache;
}

async function itemsToTracks(items: any[]): Promise<SahraeTrack[]> {
  const ids = items
    .map((i: any) => i.snippet?.resourceId?.videoId || i.contentDetails?.videoId)
    .filter(Boolean) as string[];
  const durMap = await durations(ids);
  const out: SahraeTrack[] = [];
  const seen = new Set<string>();
  for (const i of items) {
    const vid = i.snippet?.resourceId?.videoId || i.contentDetails?.videoId;
    if (!vid || seen.has(vid)) continue;
    const t = toSahraeTrack(vid, i.snippet, durMap.get(vid) || 0, i.snippet?.publishedAt);
    if (t) { seen.add(vid); out.push(t); }
  }
  return out;
}

export const youtubeAdapter: ProviderAdapter = {
  id: ID,
  displayName: 'YouTube Music',
  implemented: true,

  isConnected: () => tokenConnected(ID),
  beginConnect: () => beginAuth(ID),
  disconnect: () => { relatedCache = null; dropToken(ID); },

  searchTracks: async (query, limit = 25) => {
    const q = query.trim();
    if (!q) return [];
    // videoCategoryId=10 is Music. 100 quota units — the expensive call.
    const j = await get(`/search?part=snippet&type=video&videoCategoryId=10&maxResults=${Math.min(50, limit)}&q=${encodeURIComponent(q)}`);
    const items = (j.items || []).filter((i: any) => i.id?.videoId);
    const durMap = await durations(items.map((i: any) => i.id.videoId));
    return items
      .map((i: any) => toSahraeTrack(i.id.videoId, i.snippet, durMap.get(i.id.videoId) || 0))
      .filter(Boolean) as SahraeTrack[];
  },

  /**
   * "Library" for YouTube is Liked videos.
   *
   * YouTube Music's own Liked Music (LM) is not exposed by the Data API at all,
   * and the LL alias is not a playlist id the API resolves — the real id has to
   * come from channels.list.
   */
  getUserLibrary: async (limit = 100) => {
    const { likes } = await relatedPlaylists();
    if (!likes) return [];
    return itemsToTracks(await paged(`/playlistItems?part=snippet,contentDetails&playlistId=${likes}`, limit));
  },

  getUserPlaylists: async (limit = 50) => {
    const items = await paged('/playlists?part=snippet,contentDetails&mine=true', limit);
    return items.map((p: any): SahraePlaylistSummary => ({
      id: sahraeId(ID, p.id),
      provider: ID,
      providerId: p.id,
      name: p.snippet?.title || 'Untitled playlist',
      description: p.snippet?.description || undefined,
      artwork: thumbs(p.snippet?.thumbnails),
      trackCount: p.contentDetails?.itemCount || 0,
      owner: p.snippet?.channelTitle || undefined,
    }));
  },

  getPlaylist: async (playlistId) => {
    const id = playlistId.startsWith(`${ID}:`) ? playlistId.slice(ID.length + 1) : playlistId;
    const meta = await get(`/playlists?part=snippet,contentDetails&id=${encodeURIComponent(id)}`);
    const p = meta.items?.[0];
    if (!p) throw new ProviderError('That playlist is private or does not exist.', ID, 404);
    const tracks = await itemsToTracks(await paged(`/playlistItems?part=snippet,contentDetails&playlistId=${id}`, 500));
    return {
      id: sahraeId(ID, id),
      provider: ID,
      providerId: id,
      name: p.snippet?.title || 'Untitled playlist',
      description: p.snippet?.description || undefined,
      artwork: thumbs(p.snippet?.thumbnails),
      trackCount: tracks.length,
      owner: p.snippet?.channelTitle || undefined,
      tracks,
    } satisfies SahraePlaylist;
  },

  /**
   * Tier 1. Phase 2 would move this to the sanctioned IFrame embed (Tier 2);
   * extracting the audio stream would be neither, and is out of scope.
   */
  resolvePlaybackAction: async (track): Promise<PlaybackAction> => ({
    kind: 'deeplink',
    deepLink: track.playback.deepLink,
    webUrl: track.playback.webUrl,
    provider: ID,
  }),
};

/* eslint-enable @typescript-eslint/no-explicit-any */
