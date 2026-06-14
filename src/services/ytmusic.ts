/**
 * Sahrae Music — YouTube Music engine (Piped-backed, key-less).
 *
 * SEARCH: songs, artists, albums, playlists via Piped's YouTube-Music filters.
 * ARTIST / ALBUM / PLAYLIST pages: top songs + album lists, openable track lists.
 * RADIO / RELATED: /streams/{id}.relatedStreams powers autoplay queues and the
 *   personalised "Your Mix" generated from what the listener has been playing.
 * PLAYBACK: Google's YouTube IFrame player (see useMusic), driven by videoId.
 */

export interface Track {
  id: string; title: string; artist: string;
  artwork?: string; artworkLarge?: string; duration: number;
}
export interface Artist { id: string; name: string; thumbnail?: string }
export interface Album { id: string; name: string; thumbnail?: string; artist?: string }

export const GENRES = [
  'Afrobeats', 'Amapiano', 'Bongo Flava', 'Hip-Hop', 'R&B', 'Gengetone',
  'Reggae', 'Pop', 'Gospel', 'Drill', 'Lo-Fi', 'Dancehall',
];
export const SECTIONS: { title: string; q: string }[] = [
  { title: 'New Music Friday', q: 'new music friday 2026 latest songs' },
  { title: 'Top Hits', q: 'top hits this week' },
  { title: 'Afrobeats', q: 'afrobeats 2026 hits' },
  { title: 'Amapiano', q: 'amapiano 2026 mix songs' },
  { title: 'Bongo Flava', q: 'bongo flava 2026 hits' },
  { title: 'Hip-Hop & Rap', q: 'hip hop rap hits 2026' },
  { title: 'R&B Slow Jams', q: 'rnb slow jams 2026' },
  { title: 'Gospel', q: 'gospel hits 2026' },
];

const INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.reallyaweso.me',
  'https://piped-api.codespace.cz',
  'https://pipedapi.darkness.services',
  'https://pipedapi.phoenix.fun',
];
let working: string | null = null;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function pipedGet(path: string): Promise<any | null> {
  const order = working ? [working, ...INSTANCES.filter((i) => i !== working)] : INSTANCES;
  for (const base of order) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(base + path, { signal: ctrl.signal });
      clearTimeout(to);
      if (r.ok) { const j = await r.json(); working = base; return j; }
    } catch { /* next instance */ }
  }
  return null;
}

const vId = (u: string) => (u || '').match(/[?&]v=([^&]+)/)?.[1] || '';
const listId = (u: string) => (u || '').match(/[?&]list=([^&]+)/)?.[1] || '';
const chanId = (u: string) => (u || '').match(/\/channel\/([^/?&]+)/)?.[1] || '';

function mapItem(it: any): Track | null {
  const id = vId(it.url || '');
  if (!id || !it.duration || it.duration <= 0) return null;
  return {
    id,
    title: it.title || 'Unknown',
    artist: (it.uploaderName || '').replace(/\s*-\s*Topic$/i, '').trim() || 'Unknown Artist',
    artwork: it.thumbnail, artworkLarge: it.thumbnail, duration: it.duration,
  };
}
function mapItems(items: any[]): Track[] {
  const out: Track[] = []; const seen = new Set<string>();
  for (const it of items || []) { const t = mapItem(it); if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); } }
  return out;
}

async function searchRaw(q: string, filter: string): Promise<any[]> {
  if (!q.trim()) return [];
  const j = await pipedGet(`/search?q=${encodeURIComponent(q)}&filter=${filter}`);
  return j && Array.isArray(j.items) ? j.items : [];
}

export const ytmusic = {
  search: (q: string): Promise<Track[]> => searchRaw(q, 'music_songs').then(mapItems),

  searchArtists: async (q: string): Promise<Artist[]> => {
    const items = await searchRaw(q, 'music_artists');
    const out: Artist[] = []; const seen = new Set<string>();
    for (const it of items) {
      const id = chanId(it.url || '');
      if (id && !seen.has(id)) { seen.add(id); out.push({ id, name: it.name || it.title || 'Unknown', thumbnail: it.thumbnail }); }
    }
    return out;
  },

  searchAlbums: async (q: string, filter: 'music_albums' | 'music_playlists' = 'music_albums'): Promise<Album[]> => {
    const items = await searchRaw(q, filter);
    const out: Album[] = []; const seen = new Set<string>();
    for (const it of items) {
      const id = listId(it.url || '');
      if (id && !seen.has(id)) { seen.add(id); out.push({ id, name: it.name || it.title || 'Album', thumbnail: it.thumbnail, artist: it.uploaderName }); }
    }
    return out;
  },

  playlistTracks: async (id: string): Promise<Track[]> => {
    const j = await pipedGet(`/playlists/${id}`);
    return mapItems(j?.relatedStreams || []);
  },

  // Related songs ("up next" radio) for a video — powers autoplay + mixes.
  related: async (videoId: string): Promise<Track[]> => {
    const j = await pipedGet(`/streams/${videoId}`);
    return mapItems(j?.relatedStreams || []);
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */
