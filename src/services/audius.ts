/**
 * Sahrae Music — catalog engine.
 *
 * Powered by Audius (https://audius.org): a real, legal, key-less, CORS-open
 * streaming API with full-length tracks. Mainstream Top-40 is licence-locked for
 * everyone without a label deal; Audius gives us a genuine, deep catalog
 * (electronic / hip-hop / lo-fi / house heavy) that plays end-to-end today.
 *
 * The gateway host routes to a healthy discovery node automatically, so we don't
 * need the discovery-provider dance. The /stream endpoint 302-redirects to a
 * signed audio file an <audio> element can play directly.
 */
const HOST = 'https://api.audius.co';
const APP = 'Sahrae';

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistHandle?: string;
  artwork?: string;        // ~480px
  artworkLarge?: string;   // ~1000px
  duration: number;        // seconds
  genre?: string;
  mood?: string;
  playCount?: number;
  streamUrl: string;
}

export interface Playlist {
  id: string;
  name: string;
  artwork?: string;
  trackCount?: number;
  owner?: string;
}

// Audius's own genre taxonomy — used as browse "moods".
export const GENRES = [
  'Electronic', 'Hip-Hop/Rap', 'Lo-Fi', 'House', 'Techno', 'Dance & EDM',
  'R&B/Soul', 'Pop', 'Ambient', 'Trap', 'Deep House', 'Jazz',
];

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapTrack(t: any): Track {
  const art = t.artwork || {};
  return {
    id: String(t.id),
    title: t.title || 'Untitled',
    artist: t.user?.name || t.user?.handle || 'Unknown Artist',
    artistHandle: t.user?.handle,
    artwork: art['480x480'] || art['150x150'],
    artworkLarge: art['1000x1000'] || art['480x480'] || art['150x150'],
    duration: t.duration || 0,
    genre: t.genre,
    mood: t.mood,
    playCount: t.play_count,
    streamUrl: `${HOST}/v1/tracks/${t.id}/stream?app_name=${APP}`,
  };
}

function mapPlaylist(p: any): Playlist {
  const art = p.artwork || {};
  return {
    id: String(p.id),
    name: p.playlist_name || p.name || 'Playlist',
    artwork: art['480x480'] || art['150x150'],
    trackCount: p.track_count,
    owner: p.user?.name,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function get(path: string): Promise<any[]> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 13000);
  try {
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(`${HOST}/v1${path}${sep}app_name=${APP}`, { signal: ctrl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.data) ? j.data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(to);
  }
}

export const audius = {
  trending: (genre?: string): Promise<Track[]> =>
    get(`/tracks/trending${genre ? `?genre=${encodeURIComponent(genre)}` : ''}`).then((d) => d.map(mapTrack)),
  underground: (): Promise<Track[]> =>
    get('/tracks/trending/underground').then((d) => d.map(mapTrack)),
  trendingPlaylists: (): Promise<Playlist[]> =>
    get('/playlists/trending').then((d) => d.map(mapPlaylist)),
  searchTracks: (q: string): Promise<Track[]> =>
    get(`/tracks/search?query=${encodeURIComponent(q)}`).then((d) => d.map(mapTrack)),
  searchPlaylists: (q: string): Promise<Playlist[]> =>
    get(`/playlists/search?query=${encodeURIComponent(q)}`).then((d) => d.map(mapPlaylist)),
  playlistTracks: (id: string): Promise<Track[]> =>
    get(`/playlists/${id}/tracks`).then((d) => d.map(mapTrack)),
};
