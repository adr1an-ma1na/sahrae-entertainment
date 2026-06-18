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
  dominantColor?: string;
}

// Deterministic, pleasant "dominant colour" per track for CoverArt /
// DynamicBackground. (A real backend can replace this with the true value.)
export function dominantColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 58%, 40%)`;
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

// Upgrade a thumbnail to a crisp, large square. YT-Music cover art comes from
// lh3/googleusercontent with `=w120-h120` style sizing we can simply bump; plain
// video thumbnails are requested at hqdefault. Falls back to a direct i.ytimg URL.
function hiRes(url: string | undefined, id: string): string {
  if (!url) return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  // YT-Music square cover art (lh3/googleusercontent): request a large square.
  if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+[^&]*/, '=w1200-h1200-l90-rj');
  if (/=s\d+/.test(url)) return url.replace(/=s\d+[^&]*/, '=s1200');
  // Video thumbnail → ask for maxres (CoverArt falls back to the base thumb if 404).
  if (/(\/vi\/[^/]+\/)[a-z0-9]+\.jpg/i.test(url)) return url.replace(/(\/vi\/[^/]+\/)[a-z0-9]+\.jpg/i, '$1maxresdefault.jpg');
  return url;
}

function mapItem(it: any): Track | null {
  const id = vId(it.url || '');
  if (!id || !it.duration || it.duration <= 0) return null;
  return {
    id,
    title: it.title || 'Unknown',
    artist: (it.uploaderName || '').replace(/\s*-\s*Topic$/i, '').trim() || 'Unknown Artist',
    artwork: it.thumbnail, artworkLarge: hiRes(it.thumbnail, id), duration: it.duration,
    dominantColor: dominantColor(id),
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

  // Best directly-playable AUDIO stream for a video (used for offline downloads).
  // Prefers m4a/mp4 (broadest <audio> support) at a sane bitrate, then anything.
  // Most Piped instances return proxied URLs that play/fetch from any IP.
  audioStream: async (videoId: string): Promise<{ url: string; mime: string } | null> => {
    const j = await pipedGet(`/streams/${videoId}`);
    const streams: any[] = (j && Array.isArray(j.audioStreams)) ? j.audioStreams : [];
    if (!streams.length) return null;
    const score = (s: any) => {
      const m = String(s.mimeType || '').toLowerCase();
      const mp4 = m.includes('mp4') || m.includes('m4a') || m.includes('aac') ? 2 : 0; // prefer AAC
      const br = Number(s.bitrate || s.quality || 0);
      // cap around ~160kbps so files stay small & download fast
      const fit = br > 0 ? -Math.abs(br - 160000) / 1000 : -1000;
      return mp4 * 1000 + fit;
    };
    const best = [...streams].sort((a, b) => score(b) - score(a))[0];
    return best && best.url ? { url: best.url, mime: String(best.mimeType || 'audio/mp4').split(';')[0] } : null;
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */
