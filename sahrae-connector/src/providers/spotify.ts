import { beginAuth, disconnect as dropToken, providerFetch } from '../auth/oauthClient.ts';
import { isConnected as tokenConnected } from '../auth/tokenStore.ts';
import { sahraeId, type PlaybackAction, type SahraeArtwork, type SahraePlaylist, type SahraePlaylistSummary, type SahraeTrack } from '../types/index.ts';
import { ProviderError, type ProviderAdapter } from './types.ts';
import { resolveAction, spotifyEmbedUrl } from '../playback/tierPolicy.ts';

/**
 * Spotify Web API adapter.
 *
 * Read + play-by-permission. Tracks advertise Tier 2 (Spotify's own sanctioned
 * embed) and fall back to Tier 1 (hand off to the Spotify app) when the
 * environment cannot embed. Spotify serves the audio in both cases; nothing here
 * touches, sources or extracts media.
 */

const API = 'https://api.spotify.com/v1';
const ID: 'spotify' = 'spotify';

/* eslint-disable @typescript-eslint/no-explicit-any */

function images(list: any[]): SahraeArtwork[] {
  return (list || [])
    .filter((i) => i?.url)
    .map((i) => ({ url: i.url, width: i.width || undefined, height: i.height || undefined }));
}

/**
 * Spotify → SahraeTrack.
 *
 * Returns null for entries that cannot be played or identified: local files a
 * user added from their own disk (`is_local`) and the null placeholders Spotify
 * leaves where a track has been removed from the catalogue. Both appear in real
 * playlists and both would otherwise render as a row that does nothing.
 */
export function toSahraeTrack(t: any, addedAt?: string): SahraeTrack | null {
  if (!t || t.is_local || !t.id) return null;

  const artists: string[] = (t.artists || []).map((a: any) => a?.name).filter(Boolean);
  return {
    id: sahraeId(ID, t.id),
    provider: ID,
    providerId: t.id,
    title: String(t.name || 'Unknown'),
    artists: artists.length ? artists : ['Unknown Artist'],
    album: t.album?.name || undefined,
    durationMs: Number(t.duration_ms) || 0,
    artwork: images(t.album?.images),
    isrc: t.external_ids?.isrc || undefined,
    explicit: !!t.explicit,
    addedAt: addedAt ? Date.parse(addedAt) || undefined : undefined,
    playback: {
      // Spotify serves a sanctioned embed for every track, so the descriptor
      // advertises Tier 2 as available. tierPolicy decides whether it is
      // actually used — the track states its ceiling, the policy states the
      // circumstances.
      tier: 2,
      deepLink: t.uri || `spotify:track:${t.id}`,
      webUrl: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
      embedUrl: spotifyEmbedUrl(t.id),
    },
  };
}

async function get(path: string): Promise<any> {
  const res = await providerFetch(ID, `${API}${path}`);
  if (res.status === 401) throw new ProviderError('Spotify session expired. Reconnect to continue.', ID, 401);
  if (res.status === 403) {
    throw new ProviderError(
      'Spotify refused the request. If this app is still in development mode, the account must be added to its allow-list in the Spotify dashboard.',
      ID, 403,
    );
  }
  if (res.status === 429) {
    const retry = res.headers.get('Retry-After');
    throw new ProviderError(`Spotify is rate-limiting us${retry ? `; retry in ${retry}s` : ''}.`, ID, 429);
  }
  if (!res.ok) throw new ProviderError(`Spotify request failed (${res.status}).`, ID, res.status);
  return res.json();
}

/** Walk a paged Spotify collection up to `cap` items. */
async function paged(path: string, cap: number): Promise<any[]> {
  const out: any[] = [];
  // Spotify's page ceiling is 50 for these endpoints.
  let url: string | null = `${path}${path.includes('?') ? '&' : '?'}limit=${Math.min(50, cap)}`;
  while (url && out.length < cap) {
    const page: any = await get(url);
    out.push(...(page.items || []));
    // `next` is absolute; strip the API root so `get` can prefix it again.
    url = page.next ? String(page.next).replace(API, '') : null;
  }
  return out.slice(0, cap);
}

export const spotifyAdapter: ProviderAdapter = {
  id: ID,
  displayName: 'Spotify',
  implemented: true,

  isConnected: () => tokenConnected(ID),
  beginConnect: () => beginAuth(ID),
  disconnect: () => dropToken(ID),

  searchTracks: async (query, limit = 25) => {
    const q = query.trim();
    if (!q) return [];
    const j = await get(`/search?type=track&limit=${Math.min(50, limit)}&q=${encodeURIComponent(q)}`);
    return (j.tracks?.items || []).map((t: any) => toSahraeTrack(t)).filter(Boolean) as SahraeTrack[];
  },

  getUserLibrary: async (limit = 100) => {
    const items = await paged('/me/tracks', limit);
    return items.map((i: any) => toSahraeTrack(i.track, i.added_at)).filter(Boolean) as SahraeTrack[];
  },

  getUserPlaylists: async (limit = 50) => {
    const items = await paged('/me/playlists', limit);
    return items.filter(Boolean).map((p: any): SahraePlaylistSummary => ({
      id: sahraeId(ID, p.id),
      provider: ID,
      providerId: p.id,
      name: p.name || 'Untitled playlist',
      description: p.description || undefined,
      artwork: images(p.images),
      trackCount: p.tracks?.total || 0,
      owner: p.owner?.display_name || undefined,
    }));
  },

  getPlaylist: async (playlistId) => {
    const id = playlistId.startsWith(`${ID}:`) ? playlistId.slice(ID.length + 1) : playlistId;
    const meta = await get(`/playlists/${id}?fields=id,name,description,images,owner(display_name),tracks(total)`);
    const items = await paged(`/playlists/${id}/tracks`, 500);
    return {
      id: sahraeId(ID, meta.id),
      provider: ID,
      providerId: meta.id,
      name: meta.name || 'Untitled playlist',
      description: meta.description || undefined,
      artwork: images(meta.images),
      trackCount: meta.tracks?.total || 0,
      owner: meta.owner?.display_name || undefined,
      tracks: items.map((i: any) => toSahraeTrack(i.track, i.added_at)).filter(Boolean) as SahraeTrack[],
    } satisfies SahraePlaylist;
  },

  /**
   * Tier 2 where the environment allows it, Tier 1 otherwise — decided by
   * tierPolicy, not here, so the licensing boundary lives in one tested place
   * rather than being restated in every adapter.
   *
   * Either way Spotify serves the audio. Their embed enforces entitlement: an
   * active Premium session in this browser gets full tracks, everyone else gets
   * Spotify's own 30-second preview. We never source or extract the audio.
   */
  resolvePlaybackAction: async (track): Promise<PlaybackAction> => resolveAction(track),
};

/* eslint-enable @typescript-eslint/no-explicit-any */
