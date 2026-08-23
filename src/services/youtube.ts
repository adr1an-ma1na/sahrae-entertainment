import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Track } from './ytmusic';
import { parseISODuration, parsePlaylistId, dominantColor } from './youtubeParse';

// Re-exported so callers can keep importing them from the service they belong to.
export { parseISODuration, parsePlaylistId } from './youtubeParse';

/**
 * YouTube Music connector.
 *
 * Two ways in, both official:
 *   1. Sign in with Google (`youtube.readonly`) → the listener's OWN playlists
 *      and Liked Music, mirrored into Sahrae.
 *   2. Paste a public/unlisted playlist link → imported with an API key, no
 *      sign-in. This is how a YT Music playlist gets shared, so it covers the
 *      common case without asking anyone to authorise anything.
 *
 * Playback stays on Google's IFrame player (see useMusic) driven by videoId —
 * nothing is extracted, re-hosted or stripped out of YouTube's player, so the
 * play counts still land with the artist and nothing here depends on an
 * unofficial proxy staying up.
 *
 * BOTH routes require "YouTube Data API v3" to be enabled on the Google Cloud
 * project behind firebase-applet-config.json. It is not enabled today — every
 * call returns 403 `accessNotConfigured`. See API_DISABLED_HELP below.
 */

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Same Google Cloud project as Firebase Auth, so enabling the Data API once
// covers both routes. An explicit key wins if one is configured.
const API_KEY: string = (import.meta.env?.VITE_YOUTUBE_API_KEY as string) || firebaseConfig.apiKey;
const GCP_PROJECT = firebaseConfig.projectId;

export const API_DISABLED_HELP =
  `YouTube Data API v3 is not enabled on this app's Google project (${GCP_PROJECT}). ` +
  `Enable it at console.cloud.google.com/apis/library/youtube.googleapis.com — it is free, ` +
  `and playlists will load straight after.`;

export interface YoutubeUserProfile { name?: string; picture?: string; email?: string }

export interface YoutubePlaylist {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  trackCount: number;
}

/** YouTube stands in tombstones for removed entries rather than dropping them.
 *  They carry no playable video, so they'd render as tracks that do nothing. */
const TOMBSTONES = new Set(['Deleted video', 'Private video', 'Unavailable video']);


/* eslint-disable @typescript-eslint/no-explicit-any */

function apiError(status: number, body: any): Error {
  const reason = body?.error?.errors?.[0]?.reason || '';
  if (status === 403 && (reason === 'accessNotConfigured' || /has not been used|is disabled|are blocked/i.test(body?.error?.message || ''))) {
    return new Error(API_DISABLED_HELP);
  }
  if (status === 403 && reason === 'quotaExceeded') {
    return new Error('YouTube API quota for today is used up. It resets at midnight Pacific time.');
  }
  if (status === 404) return new Error('That playlist does not exist, or it is private. Set it to Unlisted or Public to import it.');
  return new Error(body?.error?.message || `YouTube API request failed (${status}).`);
}

class YoutubeService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('sahrae.youtube.token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('sahrae.youtube.token', token);
    localStorage.setItem('sahrae.youtube.token_time', Date.now().toString());
  }

  getToken(): string | null {
    const stored = localStorage.getItem('sahrae.youtube.token');
    const timeStr = localStorage.getItem('sahrae.youtube.token_time');
    if (!stored || !timeStr) return null;
    // Google's access tokens last an hour and there is no refresh token in the
    // popup flow, so treat anything older as gone and prompt a reconnect.
    if (Date.now() - parseInt(timeStr, 10) > 3600 * 1000) { this.disconnect(); return null; }
    this.token = stored;
    return stored;
  }

  disconnect() {
    this.token = null;
    localStorage.removeItem('sahrae.youtube.token');
    localStorage.removeItem('sahrae.youtube.token_time');
    localStorage.removeItem('sahrae.youtube.profile');
    localStorage.removeItem('sahrae.youtube.likes_playlist');
  }

  isConnected(): boolean { return this.getToken() !== null; }

  async signInWithGoogle(): Promise<string> {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
    provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
    provider.setCustomParameters({ prompt: 'consent' });

    const result = await signInWithPopup(auth, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) throw new Error('Google did not return an access token. Try connecting again.');
    this.setToken(token);
    return token;
  }

  /** Authorised call — the listener's own data. */
  private async authed<T>(endpoint: string): Promise<T> {
    const token = this.getToken();
    if (!token) throw new Error('Not connected to YouTube');
    const r = await fetch(`https://www.googleapis.com/${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      if (r.status === 401) { this.disconnect(); throw new Error('Session expired. Reconnect your YouTube account.'); }
      throw apiError(r.status, body);
    }
    return r.json();
  }

  /** Key-only call — public data, no sign-in. */
  private async publicGet<T>(endpoint: string): Promise<T> {
    const sep = endpoint.includes('?') ? '&' : '?';
    const r = await fetch(`https://www.googleapis.com/${endpoint}${sep}key=${API_KEY}`);
    if (!r.ok) throw apiError(r.status, await r.json().catch(() => ({})));
    return r.json();
  }

  /**
   * Walk every page of a list endpoint.
   *
   * This is the difference between "your playlist" and "the first 50 tracks of
   * your playlist" — maxResults caps at 50 and the old code stopped there, so a
   * 300-song playlist silently arrived as 50. `cap` is a safety rail against a
   * runaway playlist, not a feature limit.
   */
  private async paged(endpoint: string, authed: boolean, cap = 2000): Promise<any[]> {
    const items: any[] = [];
    let pageToken = '';
    do {
      const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const data: any = authed ? await this.authed(url) : await this.publicGet(url);
      items.push(...(data.items || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken && items.length < cap);
    return items;
  }

  async fetchUserProfile(): Promise<YoutubeUserProfile> {
    try {
      const d = await this.authed<any>('oauth2/v1/userinfo');
      const profile: YoutubeUserProfile = { name: d.name, picture: d.picture, email: d.email };
      localStorage.setItem('sahrae.youtube.profile', JSON.stringify(profile));
      return profile;
    } catch (err) {
      const cached = localStorage.getItem('sahrae.youtube.profile');
      if (cached) return JSON.parse(cached);
      throw err;
    }
  }

  /** Every playlist the listener owns — all pages, not the first 50. */
  async fetchPlaylists(): Promise<YoutubePlaylist[]> {
    const items = await this.paged('youtube/v3/playlists?part=snippet,contentDetails&mine=true', true);
    return items.map((item: any) => {
      const s = item.snippet || {};
      const th = s.thumbnails || {};
      return {
        id: item.id,
        title: s.title || 'Untitled Playlist',
        description: s.description || '',
        thumbnail: th.high?.url || th.medium?.url || th.default?.url || '',
        trackCount: item.contentDetails?.itemCount || 0,
      };
    });
  }

  /**
   * Real durations, in batches of 50.
   *
   * playlistItems does not carry duration at all — the old code filled in a flat
   * 180s for every track, which made every progress bar and every total wrong.
   * videos.list is 1 quota unit per call regardless of how many ids you pass, so
   * this is close to free.
   */
  private async attachDurations(tracks: Track[], authed: boolean): Promise<Track[]> {
    const ids = tracks.map((t) => t.id).filter(Boolean);
    const byId = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50).join(',');
      const ep = `youtube/v3/videos?part=contentDetails&id=${chunk}`;
      try {
        const d: any = authed ? await this.authed(ep) : await this.publicGet(ep);
        for (const v of d.items || []) byId.set(v.id, parseISODuration(v.contentDetails?.duration || ''));
      } catch { /* durations are a nicety — never fail the whole playlist for them */ }
    }
    // Leave duration 0 rather than inventing one when the lookup missed: the
    // player reads the true length off the media once it starts, and 0 renders
    // as "--:--" instead of a confident wrong number.
    return tracks.map((t) => ({ ...t, duration: byId.get(t.id) ?? 0 }));
  }

  private mapItems(items: any[]): Track[] {
    const out: Track[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const s = item.snippet || {};
      const videoId = s.resourceId?.videoId;
      if (!videoId || seen.has(videoId)) continue;
      const title = s.title || '';
      if (TOMBSTONES.has(title)) continue; // removed upstream — not playable
      seen.add(videoId);
      const th = s.thumbnails || {};
      out.push({
        id: videoId,
        title: title || 'Unknown Title',
        // "- Topic" is how YouTube labels auto-generated artist channels.
        artist: String(s.videoOwnerChannelTitle || s.channelTitle || 'YouTube').replace(/\s*-\s*Topic$/i, '').trim(),
        artwork: th.medium?.url || th.default?.url || '',
        artworkLarge: th.maxres?.url || th.standard?.url || th.high?.url || th.medium?.url || '',
        duration: 0,
        dominantColor: dominantColor(videoId),
      });
    }
    return out;
  }

  /** A playlist the listener owns, complete and with real durations. */
  async fetchPlaylistTracks(playlistId: string): Promise<Track[]> {
    const items = await this.paged(`youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}`, true);
    return this.attachDurations(this.mapItems(items), true);
  }

  /**
   * Liked Music.
   *
   * The old code asked for playlist "LM", then "LL". Neither is a playlist id
   * the Data API accepts: LM (YouTube Music's Liked Music) is not exposed by the
   * API at all, and LL is an alias the API does not resolve. The real id comes
   * from channels.list → contentDetails.relatedPlaylists.likes, which is what
   * this does. Cached, because it never changes for a given account.
   */
  async fetchLikedMusic(): Promise<Track[]> {
    let likesId = localStorage.getItem('sahrae.youtube.likes_playlist') || '';
    if (!likesId) {
      const d = await this.authed<any>('youtube/v3/channels?part=contentDetails&mine=true');
      likesId = d.items?.[0]?.contentDetails?.relatedPlaylists?.likes || '';
      if (!likesId) throw new Error('This Google account has no YouTube channel, so it has no Liked list. Open YouTube once to create one.');
      localStorage.setItem('sahrae.youtube.likes_playlist', likesId);
    }
    return this.fetchPlaylistTracks(likesId);
  }

  /**
   * Import a public or unlisted playlist from a pasted link — no sign-in.
   * Returns the playlist's own title/artwork alongside its tracks so it lands in
   * Sahrae looking like it does on YouTube Music.
   */
  async importPublicPlaylist(input: string): Promise<{ playlist: YoutubePlaylist; tracks: Track[] }> {
    const id = parsePlaylistId(input);
    if (!id) throw new Error('That does not look like a playlist link. Copy the share link from YouTube Music, or paste a link containing "list=".');

    const meta: any = await this.publicGet(`youtube/v3/playlists?part=snippet,contentDetails&id=${id}`);
    const p = meta.items?.[0];
    if (!p) throw new Error('That playlist is private or does not exist. Set it to Unlisted or Public in YouTube Music, then paste the link again.');

    const items = await this.paged(`youtube/v3/playlistItems?part=snippet&playlistId=${id}`, false);
    const tracks = await this.attachDurations(this.mapItems(items), false);
    const th = p.snippet?.thumbnails || {};

    return {
      playlist: {
        id,
        title: p.snippet?.title || 'YouTube playlist',
        description: p.snippet?.description || '',
        thumbnail: th.high?.url || th.medium?.url || th.default?.url || '',
        trackCount: tracks.length,
      },
      tracks,
    };
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export const youtubeService = new YoutubeService();
