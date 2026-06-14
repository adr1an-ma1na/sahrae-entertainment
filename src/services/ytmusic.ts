/**
 * Sahrae Music — YouTube Music engine.
 *
 * SEARCH: Piped (open-source YouTube proxies) gives the full YouTube Music
 * catalog with no API key and no quota. We keep a list of instances and fail
 * over between them, caching whichever answers — so a dead instance never takes
 * the feature down.
 *
 * PLAYBACK: handled by Google's own YouTube IFrame player (see useMusic) using
 * the videoId — device-reliable, no IP-locked stream extraction to break.
 */

export interface Track {
  id: string;          // YouTube videoId
  title: string;
  artist: string;
  artwork?: string;
  artworkLarge?: string;
  duration: number;    // seconds
}

// Quick-search chips (mainstream + East-African relevance).
export const GENRES = [
  'Afrobeats', 'Amapiano', 'Bongo Flava', 'Hip-Hop', 'R&B', 'Gengetone',
  'Reggae', 'Pop', 'Gospel', 'Drill', 'Lo-Fi', 'Dancehall',
];

// Home shelves — each is a YouTube Music search.
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

// Piped API instances (failover order). Public; some come and go — the loop
// skips dead ones, so coverage stays up as long as one answers.
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
      if (r.ok) {
        const j = await r.json();
        working = base;
        return j;
      }
    } catch {
      /* try next instance */
    }
  }
  return null;
}

function videoIdFromUrl(url: string): string {
  // Piped item url is like "/watch?v=VIDEOID"
  const m = (url || '').match(/[?&]v=([^&]+)/);
  return m ? m[1] : '';
}

function mapItem(it: any): Track | null {
  const id = videoIdFromUrl(it.url || '');
  if (!id) return null;
  // Skip live streams / playlists / anything without a real runtime.
  if (!it.duration || it.duration <= 0) return null;
  return {
    id,
    title: it.title || 'Unknown',
    artist: (it.uploaderName || '').replace(/\s*-\s*Topic$/i, '').trim() || 'Unknown Artist',
    artwork: it.thumbnail,
    artworkLarge: it.thumbnail,
    duration: it.duration,
  };
}

export const ytmusic = {
  async search(query: string): Promise<Track[]> {
    const q = query.trim();
    if (!q) return [];
    const j = await pipedGet(`/search?q=${encodeURIComponent(q)}&filter=music_songs`);
    const items: any[] = (j && Array.isArray(j.items) ? j.items : []);
    const out: Track[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      const t = mapItem(it);
      if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
    }
    return out;
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */
