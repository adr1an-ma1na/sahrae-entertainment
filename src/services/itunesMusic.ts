import { Track } from './ytmusic';

/**
 * Music from the iTunes Search API (key-less). Mainstream catalog (everything),
 * with a direct `previewUrl` (~30s AAC/m4a) that plays in an <audio> element —
 * so these tracks BACKGROUND and DOWNLOAD via the real-file lane. Note: Apple
 * only exposes 30-second previews for songs (full tracks are licence/DRM-locked),
 * so each track is a preview clip, not the full song.
 *
 * Feeds are fetched through the native /__ddfetch passthrough (no CORS) in the
 * APK, with a direct fetch fallback for the browser preview.
 */
const COUNTRY = 'US';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapSong(r: any): Track {
  const art100 = String(r.artworkUrl100 || r.artworkUrl60 || '');
  const big = art100.replace(/\/\d+x\d+bb\./, '/600x600bb.');
  const med = art100.replace(/\/\d+x\d+bb\./, '/300x300bb.');
  return {
    id: `itunes:${r.trackId}`,
    title: String(r.trackName || 'Untitled'),
    artist: String(r.artistName || 'Unknown'),
    artwork: med || art100,
    artworkLarge: big || art100,
    duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 30,
    audioUrl: String(r.previewUrl || ''),
  };
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(`https://localhost/__ddfetch?u=${encodeURIComponent(url)}`, { cache: 'no-store' });
    if (r.ok) { const t = await r.text(); if (t) return JSON.parse(t); }
  } catch { /* not native */ }
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch { /* give up */ }
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const itunes = {
  /** Search mainstream songs (each carries a 30s preview as audioUrl). */
  searchSongs: async (term: string, limit = 25): Promise<Track[]> => {
    const j = await fetchJson(`https://itunes.apple.com/search?media=music&entity=song&country=${COUNTRY}&limit=${limit}&term=${encodeURIComponent(term)}`);
    if (!j || !Array.isArray(j.results)) return [];
    return j.results.filter((r: { previewUrl?: string }) => r.previewUrl).map(mapSong);
  },
};
