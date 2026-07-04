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
  channelId?: string; // YouTube channel/show id (for podcast show feeds)
  date?: string;      // human-readable upload/release date
  uploaded?: number;  // raw upload timestamp (ms) for sorting
  audioUrl?: string;  // direct audio file URL (podcast RSS / owned catalog) → plays via <audio>, backgrounds
  feedUrl?: string;   // podcast show RSS feed (for opening a show's episodes)
  scStream?: string;  // SoundCloud progressive transcoding URL → resolved to audioUrl on play
  description?: string; // podcast episode show-notes (HTML), for the episode detail page
  chaptersUrl?: string; // <podcast:chapters> JSON url (fetched on demand)
  chapters?: { start: number; title: string }[]; // inline <psc:chapter> chapters
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
// Genre- & region-curated shelves (song-oriented queries — no "mix"/"tiktok"
// that pull cheap DJ compilations). Reads like a connoisseur's browse, not a
// bootleg mixtape wall.
export const SECTIONS: { title: string; q: string }[] = [
  // Discovery
  { title: 'New Music Friday', q: 'new music friday 2026 new songs' },
  { title: 'Trending Now', q: 'trending songs 2026' },
  { title: 'Top Hits', q: 'top hits 2026' },
  { title: 'Fresh Finds', q: 'new song releases 2026' },
  // By region
  { title: 'USA', q: 'usa top songs 2026' },
  { title: 'United Kingdom', q: 'uk top songs 2026' },
  { title: 'France', q: 'french songs 2026' },
  { title: 'Spain', q: 'spanish songs 2026 exitos' },
  { title: 'Brazil', q: 'brazil songs 2026 sucessos' },
  { title: 'Europe', q: 'european top hits 2026' },
  // By genre
  { title: 'Afrobeats Essentials', q: 'best afrobeats songs 2026' },
  { title: 'Amapiano', q: 'amapiano 2026 hits' },
  { title: 'US Hip-Hop', q: 'us hip hop songs 2026' },
  { title: 'R&B', q: 'best rnb songs 2026' },
  { title: 'Pop', q: 'best pop songs 2026' },
];

// Trending playlists by country/region — rendered as tappable cards. Each opens
// a 50-track page built from its region-appropriate queries (refreshed daily).
export type TrendingPlaylist = { id: string; title: string; short: string; subtitle: string; flag: string; grad: string; count: number; weekly?: boolean; queries: string[] };
export const TRENDING_PLAYLISTS: TrendingPlaylist[] = [
  // Regional - 100 songs, well-curated, refreshed daily.
  { id: 'americas', title: 'Top 100 - Americas', short: 'Americas', flag: '\u{1F30E}', subtitle: 'US, Latin, Canada & Brazil', grad: 'from-blue-600 to-red-600', count: 100, queries: ['billboard hot 100 2026', 'top songs usa this week 2026', 'latin hits 2026', 'reggaeton 2026 hits', 'canada top hits 2026', 'brazil top hits 2026', 'top 100 songs america 2026'] },
  { id: 'africa', title: 'Top 100 - Africa', short: 'Africa', flag: '\u{1F30D}', subtitle: 'Afrobeats, Amapiano, Bongo & more', grad: 'from-amber-500 to-emerald-700', count: 100, queries: ['afrobeats top 100 2026', 'amapiano hits 2026', 'bongo flava 2026', 'gengetone hits 2026', 'naija top songs 2026', 'south africa top hits 2026', 'african hits this week 2026'] },
  { id: 'southamerica', title: 'Top 100 - South America', short: 'S. America', flag: '\u{1F30E}', subtitle: 'Reggaeton, Sertanejo & Latin pop', grad: 'from-yellow-500 to-green-600', count: 100, queries: ['reggaeton hits 2026', 'brazil funk sertanejo 2026', 'latin top 100 2026', 'argentina top songs 2026', 'colombia top hits 2026', 'musica latina 2026 exitos', 'peru chile top hits 2026'] },
  { id: 'uk', title: 'Top 100 - United Kingdom', short: 'UK', flag: '\u{1F1EC}\u{1F1E7}', subtitle: 'Official Chart, Pop & Drill', grad: 'from-blue-700 to-rose-600', count: 100, queries: ['uk official chart top 40 2026', 'uk top 100 songs 2026', 'uk drill grime 2026', 'british pop hits 2026', 'uk dance 2026', 'uk rnb 2026', 'uk hits this week 2026'] },
  { id: 'europe', title: 'Top 100 - Europe', short: 'Europe', flag: '\u{1F1EA}\u{1F1FA}', subtitle: 'Pan-European hits', grad: 'from-indigo-600 to-sky-600', count: 100, queries: ['europe top hits 2026', 'german top charts 2026', 'french hits 2026', 'spanish hits 2026', 'italian top songs 2026', 'dutch top 40 2026', 'europe top 100 2026'] },
  // Country - Top 50.
  { id: 'us', title: 'Top 50 - United States', short: 'USA', flag: '\u{1F1FA}\u{1F1F8}', subtitle: 'Trending in the US', grad: 'from-blue-600 to-red-600', count: 50, queries: ['billboard hot 100 2026', 'top songs usa this week 2026', 'us trending songs 2026'] },
  { id: 'ke', title: 'Top 50 - Kenya', short: 'Kenya', flag: '\u{1F1F0}\u{1F1EA}', subtitle: 'Trending in Kenya', grad: 'from-red-600 to-green-700', count: 50, queries: ['kenya trending songs 2026', 'gengetone hits 2026', 'kenyan music 2026 hits'] },
  { id: 'ug', title: 'Top 50 - Uganda', short: 'Uganda', flag: '\u{1F1FA}\u{1F1EC}', subtitle: 'Trending in Uganda', grad: 'from-yellow-500 to-red-600', count: 50, queries: ['uganda trending songs 2026', 'ugandan music 2026 hits'] },
  { id: 'tz', title: 'Top 50 - Tanzania', short: 'Tanzania', flag: '\u{1F1F9}\u{1F1FF}', subtitle: 'Trending in Tanzania', grad: 'from-green-600 to-yellow-500', count: 50, queries: ['bongo flava 2026 hits', 'tanzania trending songs 2026'] },
  { id: 'ng', title: 'Top 50 - Nigeria', short: 'Nigeria', flag: '\u{1F1F3}\u{1F1EC}', subtitle: 'Trending in Nigeria', grad: 'from-green-600 to-emerald-800', count: 50, queries: ['naija afrobeats 2026 hits', 'nigeria trending songs 2026'] },
  { id: 'gh', title: 'Top 50 - Ghana', short: 'Ghana', flag: '\u{1F1EC}\u{1F1ED}', subtitle: 'Trending in Ghana', grad: 'from-red-600 to-yellow-500', count: 50, queries: ['ghana trending songs 2026', 'ghanaian afrobeats 2026'] },
  { id: 'za', title: 'Top 50 - South Africa', short: 'S. Africa', flag: '\u{1F1FF}\u{1F1E6}', subtitle: 'Trending in South Africa', grad: 'from-green-600 to-amber-600', count: 50, queries: ['amapiano 2026 hits', 'south africa trending songs 2026'] },
  // Weekly New Music Friday (reshuffles each week).
  { id: 'nmf-af', title: 'New Music Friday - Africa', short: 'NMF Africa', flag: '\u{1F30D}', subtitle: 'Fresh African drops, weekly', grad: 'from-amber-500 to-emerald-700', count: 50, weekly: true, queries: ['new african music this week 2026', 'new afrobeats friday 2026', 'new amapiano this week 2026', 'new bongo flava 2026'] },
  { id: 'nmf-global', title: 'New Music Friday - Global', short: 'NMF Global', flag: '\u{1F310}', subtitle: 'Fresh worldwide, weekly', grad: 'from-sky-500 to-violet-700', count: 50, weekly: true, queries: ['new music friday 2026', 'new songs this week 2026', 'new pop releases 2026', 'new hip hop this week 2026'] },
];

const INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.private.coffee',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi.ducks.party',
  'https://pipedapi.smnz.de',
  'https://piped-api.lunar.icu',
  'https://piped-api.codespace.cz',
  'https://pipedapi.darkness.services',
  'https://pipedapi.phoenix.fun',
];
let working: string | null = null;

// ── Concurrency limiter ──
// Catalog requests share the native request interceptor with YouTube playback,
// so flooding it (e.g. many shelves resolving at once) can STARVE the player
// (symptom: it never starts, 0:00). Cap how many catalog fetches run at once so
// the player's lane is always free. This is the foundation that makes
// catalog-heavy features (Made For You, Podcasts) safe.
const MAX_CONCURRENT = 3;
let activeReqs = 0;
const reqQueue: (() => void)[] = [];
function acquireSlot(): Promise<void> {
  if (activeReqs < MAX_CONCURRENT) { activeReqs++; return Promise.resolve(); }
  return new Promise<void>((resolve) => reqQueue.push(resolve));
}
function releaseSlot() {
  const next = reqQueue.shift();
  if (next) next();        // hand the slot straight to the next waiter
  else activeReqs--;       // nobody waiting → free the slot
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Fetch JSON, trying the request directly first, then through the native
// passthrough (/__ddfetch) which bypasses CORS / WebView-origin blocks in the
// APK — so an instance that's UP but CORS-restrictive still works.
async function fetchJson(url: string, ms: number): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    if (r.ok) return await r.json();
  } catch { /* try the native passthrough */ }
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms + 2000);
    const r = await fetch(`https://localhost/__ddfetch?u=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    clearTimeout(to);
    if (r.ok) return await r.json();
  } catch { /* give up on this instance */ }
  return null;
}

// Direct-only fetch (no native passthrough) — used in the cold-start race so we
// don't flood the native interceptor that playback shares.
async function fetchDirect(url: string, ms: number): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    if (r.ok) return await r.json();
  } catch { /* dead/blocked */ }
  return null;
}

async function pipedGet(path: string): Promise<any | null> {
  await acquireSlot();
  try {
    // Warm path: a known-good instance answers in one fast request.
    if (working) {
      const j = await fetchJson(working + path, 5000);
      if (j) return j;
      working = null; // it died — fall through to re-race
    }
    // Cold path: RACE every instance at once; the first that answers wins and is
    // cached, so search/shelves resolve in ~1-2s instead of trying dead servers
    // one-by-one (which took minutes).
    const winner = await new Promise<{ base: string; j: any } | null>((resolve) => {
      let pending = INSTANCES.length;
      let done = false;
      INSTANCES.forEach((base) => {
        fetchDirect(base + path, 5000).then((j) => {
          if (done) return;
          if (j) { done = true; working = base; resolve({ base, j }); }
          else { pending -= 1; if (pending === 0) resolve(null); }
        });
      });
    });
    if (winner) return winner.j;
    // Last resort: native passthrough (handles CORS-only networks).
    return await fetchJson(INSTANCES[0] + path, 7000);
  } finally {
    releaseSlot();
  }
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

function fmtDate(it: any): string | undefined {
  if (it.uploaded && it.uploaded > 0) {
    try { return new Date(it.uploaded).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { /* ignore */ }
  }
  return it.uploadedDate || undefined;
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
    channelId: chanId(it.uploaderUrl || ''),
    date: fmtDate(it),
    uploaded: typeof it.uploaded === 'number' ? it.uploaded : 0,
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

  // Video search — used for Podcasts (which live as videos on YouTube). Returns
  // the same Track shape (id = videoId) so it plays through the music engine for
  // audio, or via a YouTube embed for video.
  searchVideos: (q: string): Promise<Track[]> => searchRaw(q, 'videos').then(mapItems),

  // A podcast SHOW's full episode feed (the channel's uploads), newest first,
  // with a nextpage token for "load more".
  channelVideos: async (channelId: string): Promise<{ items: Track[]; nextpage: string | null }> => {
    const j = await pipedGet(`/channel/${channelId}`);
    return { items: mapItems(j?.relatedStreams || []), nextpage: (j && j.nextpage) || null };
  },
  channelMore: async (channelId: string, nextpage: string): Promise<{ items: Track[]; nextpage: string | null }> => {
    const j = await pipedGet(`/nextpage/channel/${channelId}?nextpage=${encodeURIComponent(nextpage)}`);
    return { items: mapItems(j?.relatedStreams || []), nextpage: (j && j.nextpage) || null };
  },

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
  // NEVER returns empty: if the source has no relatedStreams, backfill from the
  // track's own artist, then a popular fallback (so "Related" is always full).
  related: async (videoId: string): Promise<Track[]> => {
    const j = await pipedGet(`/streams/${videoId}`);
    const out = mapItems(j?.relatedStreams || []);
    if (out.length >= 5) return out;
    const seen = new Set<string>([videoId, ...out.map((t) => t.id)]);
    const push = (list: Track[]) => { for (const t of list) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); } };
    const artist = String(j?.uploader || '').replace(/\s*-\s*topic$/i, '').trim();
    const title = String(j?.title || '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    const seed = artist || title;
    if (seed) push(await ytmusic.search(`${seed} songs`).catch(() => [] as Track[]));
    if (out.length < 5) push(await ytmusic.search('top hits 2026').catch(() => [] as Track[]));
    return out;
  },

  // Real, auto-updated YouTube trending feed for a country (region = ISO-2:
  // US, KE, NG, GB, ZA…). Song-length items only. Powers the country/region
  // charts so they reflect what's ACTUALLY trending now, not a static search.
  trending: async (region: string): Promise<Track[]> => {
    const j = await pipedGet(`/trending?region=${encodeURIComponent(region)}`);
    const arr = Array.isArray(j) ? j : (j && Array.isArray(j.items) ? j.items : []);
    return mapItems(arr).filter((t) => t.duration >= 60 && t.duration <= 600);
  },

  // Best directly-playable AUDIO stream for a video (used for offline downloads).
  // Prefers m4a/mp4 (broadest <audio> support) at a sane bitrate, then anything.
  // Most Piped instances return proxied URLs that play/fetch from any IP.
  audioStream: async (videoId: string): Promise<{ url: string; mime: string } | null> => {
    // 1) Piped adaptive audio (fast when an instance is healthy).
    try {
      const j = await pipedGet(`/streams/${videoId}`);
      const streams: any[] = (j && Array.isArray(j.audioStreams)) ? j.audioStreams : [];
      if (streams.length) {
        const score = (s: any) => {
          const m = String(s.mimeType || '').toLowerCase();
          const mp4 = m.includes('mp4') || m.includes('m4a') || m.includes('aac') ? 2 : 0; // prefer AAC
          const br = Number(s.bitrate || s.quality || 0);
          // cap around ~160kbps so files stay small & download fast
          const fit = br > 0 ? -Math.abs(br - 160000) / 1000 : -1000;
          return mp4 * 1000 + fit;
        };
        const best = [...streams].sort((a, b) => score(b) - score(a))[0];
        if (best && best.url) return { url: best.url, mime: String(best.mimeType || 'audio/mp4').split(';')[0] };
      }
    } catch { /* fall through to the on-device resolver */ }
    // 2) On-device native resolver (residential IP -> a real, playable googlevideo
    //    audio URL). Powers reliable downloads + background playback.
    try {
      const r = await fetch(`https://localhost/__ytaudio?v=${encodeURIComponent(videoId)}`, { cache: 'no-store' });
      if (r.ok) { const a = await r.json(); if (a && a.url) return { url: a.url, mime: 'audio/mp4' }; }
    } catch { /* give up -> caller falls back to streaming */ }
    return null;
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */
