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
 * Two separate permissions gate these, and conflating them cost real time once:
 *   - The OAUTH route needs YouTube Data API v3 ENABLED on the project. It sends
 *     a Bearer token and no API key, so key restrictions do not touch it.
 *   - The KEY route additionally needs the API key to ALLOW YouTube. A key
 *     Firebase created is restricted to Firebase's own services by default, so
 *     it returns 403 API_KEY_SERVICE_BLOCKED even when the API is enabled.
 */

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Same Google Cloud project as Firebase Auth, so enabling the Data API once
// covers both routes. An explicit key wins if one is configured.
const API_KEY: string = (import.meta.env?.VITE_YOUTUBE_API_KEY as string) || firebaseConfig.apiKey;
const GCP_PROJECT = firebaseConfig.projectId;

/**
 * Two different 403s, and telling them apart matters — they have different fixes
 * and pointing at the wrong one wastes real time.
 *
 *  SERVICE_DISABLED / accessNotConfigured
 *      The API is switched off for the project. Fix: enable it.
 *
 *  API_KEY_SERVICE_BLOCKED
 *      The API is on, but this API KEY is restricted to a list of APIs that does
 *      not include YouTube. Enabling the API changes nothing. Fix: edit the key's
 *      API restrictions. This is the default state of a key Firebase created,
 *      because Firebase restricts its browser key to its own services.
 */
export const API_DISABLED_HELP =
  `YouTube Data API v3 is not enabled on this app's Google project (${GCP_PROJECT}). ` +
  `Enable it at console.cloud.google.com/apis/library/youtube.googleapis.com — it is free.`;

export const KEY_BLOCKED_HELP =
  `This app's API key is not allowed to call YouTube. The API itself may well be enabled — ` +
  `the key has its own separate allow-list. Open Google Cloud → APIs & Services → Credentials, ` +
  `click the browser key for ${GCP_PROJECT}, and under "API restrictions" add "YouTube Data API v3" ` +
  `(or choose "Don't restrict key"). Signing in with Google is unaffected: that path uses an OAuth ` +
  `token rather than the key.`;

export const CREDENTIALS_URL =
  `https://console.cloud.google.com/apis/credentials?project=${GCP_PROJECT}`;

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

/** YouTube's category id for Music. The only reliable way to tell a liked song
 *  from a liked anything-else — there is one Liked list, not two. */
const MUSIC_CATEGORY_ID = '10';


/* eslint-disable @typescript-eslint/no-explicit-any */

function apiError(status: number, body: any): Error {
  const reason = body?.error?.errors?.[0]?.reason || '';
  // The structured reason is the reliable signal; the human message for both
  // cases mentions "blocked", which is why matching on text alone got this
  // wrong and reported a disabled API when the key was the problem.
  const detailReason = (body?.error?.details || [])
    .find((d: any) => d?.['@type']?.includes('ErrorInfo'))?.reason || '';
  if (status === 403 && detailReason === 'API_KEY_SERVICE_BLOCKED') {
    return new Error(KEY_BLOCKED_HELP);
  }
  if (status === 403 && (reason === 'accessNotConfigured' || detailReason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(body?.error?.message || ''))) {
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
  private async paged(endpoint: string, authed: boolean, cap = 2000, onPage?: (items: any[]) => void): Promise<any[]> {
    const items: any[] = [];
    let pageToken = '';
    do {
      const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const data: any = authed ? await this.authed(url) : await this.publicGet(url);
      const page = data.items || [];
      items.push(...page);
      // Hand each page up as it lands so the UI can paint the first 50 instead
      // of waiting for a whole library to finish walking.
      if (onPage && page.length) onPage(page);
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
    return (await this.attachDetails(tracks, authed)).map(({ categoryId: _c, ...t }) => t);
  }

  /**
   * Duration AND category, in batches of 50.
   *
   * videos.list costs 1 quota unit per call regardless of how many ids it
   * carries, so asking for `snippet` alongside `contentDetails` is free and
   * gives us `categoryId` — the only reliable signal for whether a liked item is
   * music. Everything below depends on it.
   */
  private async attachDetails(tracks: Track[], authed: boolean): Promise<(Track & { categoryId?: string })[]> {
    const ids = tracks.map((t) => t.id).filter(Boolean);
    const byId = new Map<string, { duration: number; categoryId?: string }>();

    // The batches are independent, so run them together. Sequentially, a
    // 500-item library meant ten round trips end to end before anything could
    // render; in parallel it is one round trip's worth of waiting.
    const chunks: string[] = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50).join(','));
    await Promise.all(chunks.map(async (chunk) => {
      const ep = `youtube/v3/videos?part=contentDetails,snippet&id=${chunk}`;
      try {
        const d: any = authed ? await this.authed(ep) : await this.publicGet(ep);
        for (const v of d.items || []) {
          byId.set(v.id, {
            duration: parseISODuration(v.contentDetails?.duration || ''),
            categoryId: v.snippet?.categoryId,
          });
        }
      } catch { /* details are a nicety — never fail the whole playlist for them */ }
    }));
    // Leave duration 0 rather than inventing one when the lookup missed: the
    // player reads the true length off the media once it starts, and 0 renders
    // as "--:--" instead of a confident wrong number.
    return tracks.map((t) => ({
      ...t,
      duration: byId.get(t.id)?.duration ?? 0,
      categoryId: byId.get(t.id)?.categoryId,
    }));
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
   * The account's Liked playlist id.
   *
   * "LM" (YouTube Music's own Liked Music) is not exposed by the Data API at
   * all, and "LL" is an alias the API does not resolve — both were tried by an
   * earlier version and neither works. The real id comes from channels.list.
   * Cached, because it never changes for an account.
   */
  private async likesPlaylistId(): Promise<string> {
    const cached = localStorage.getItem('sahrae.youtube.likes_playlist') || '';
    if (cached) return cached;
    const d = await this.authed<any>('youtube/v3/channels?part=contentDetails&mine=true');
    const id = d.items?.[0]?.contentDetails?.relatedPlaylists?.likes || '';
    if (!id) throw new Error('This Google account has no YouTube channel, so it has no Liked list. Open YouTube once to create one.');
    localStorage.setItem('sahrae.youtube.likes_playlist', id);
    return id;
  }

  /**
   * Liked items, optionally narrowed to music.
   *
   * There is one Liked list on a Google account — YouTube and YouTube Music both
   * write to it. So "Liked Music" is not a separate list to fetch; it is this
   * list filtered to category 10 (Music). Without that filter, a liked cat video
   * shows up in the music library, which is what the previous version did.
   *
   * Category is the primary signal; the length window is a backstop for items
   * the details lookup missed, since a 3-second clip or a 2-hour stream is not a
   * song whatever it is tagged.
   */
  async fetchLiked(
    kind: 'music' | 'all' = 'all',
    onPartial?: (tracks: Track[]) => void,
  ): Promise<Track[]> {
    const listId = await this.likesPlaylistId();
    const narrow = (rows: (Track & { categoryId?: string })[]) => (kind === 'music'
      ? rows.filter((t) => t.categoryId === MUSIC_CATEGORY_ID
        && (t.duration === 0 || (t.duration >= 30 && t.duration <= 1800)))
      : rows
    ).map(({ categoryId: _c, ...t }) => t);

    // Paint the first page while the rest is still arriving. A large library
    // used to show nothing at all until every page and every detail batch had
    // completed, which read as the connection being slow rather than thorough.
    let firstPageDone = false;
    const items = await this.paged(
      `youtube/v3/playlistItems?part=snippet&playlistId=${listId}`,
      true, 2000,
      onPartial
        ? (page) => {
          if (firstPageDone) return;
          firstPageDone = true;
          this.attachDetails(this.mapItems(page), true)
            .then((rows) => onPartial(narrow(rows)))
            .catch(() => { /* the full pass below is the real answer */ });
        }
        : undefined,
    );

    return narrow(await this.attachDetails(this.mapItems(items), true));
  }

  /** Liked music only. */
  fetchLikedMusic(onPartial?: (t: Track[]) => void): Promise<Track[]> { return this.fetchLiked('music', onPartial); }

  /** Everything liked, unfiltered — the YouTube (videos) surface. */
  fetchLikedVideos(onPartial?: (t: Track[]) => void): Promise<Track[]> { return this.fetchLiked('all', onPartial); }

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
