import { Track } from './ytmusic';

/**
 * SoundCloud lane — how apps like eSound source music: stream from SoundCloud's
 * own endpoints. FULL tracks with direct stream URLs → play via <audio>
 * (background + download). GREY-AREA: unlicensed, against SoundCloud's ToS, and
 * can break when they change things — the user opted into this.
 *
 * SoundCloud's official API is closed, so we extract a fresh client_id from the
 * public web player's JS at runtime (through the native /__ddfetch passthrough,
 * which sidesteps CORS in the APK). The v2 API returns "transcodings"; the
 * progressive one resolves (with the client_id) to a real MP3 URL.
 */
const API = 'https://api-v2.soundcloud.com';

async function ddText(url: string): Promise<string | null> {
  try {
    const r = await fetch(`https://localhost/__ddfetch?u=${encodeURIComponent(url)}`, { cache: 'no-store' });
    if (r.ok) { const t = await r.text(); if (t) return t; }
  } catch { /* not native */ }
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) return await r.text();
  } catch { /* give up */ }
  return null;
}

let CLIENT_ID = '';
async function clientId(): Promise<string> {
  if (CLIENT_ID) return CLIENT_ID;
  const html = await ddText('https://soundcloud.com/discover');
  if (!html) return '';
  const scripts = Array.from(html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)).map((m) => m[1]);
  // The client_id lives in one of the later asset bundles.
  for (const s of scripts.reverse()) {
    const js = await ddText(s);
    if (!js) continue;
    const m = js.match(/client_id\s*[:=]\s*"([0-9a-zA-Z]{20,40})"/);
    if (m) { CLIENT_ID = m[1]; return CLIENT_ID; }
  }
  return '';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function api(path: string): Promise<any | null> {
  const cid = await clientId();
  if (!cid) return null;
  const sep = path.includes('?') ? '&' : '?';
  const t = await ddText(`${API}${path}${sep}client_id=${cid}`);
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}

function progressive(t: any): string {
  const list = t?.media?.transcodings || [];
  const prog = list.find((x: any) => x?.format?.protocol === 'progressive') || list[0];
  return prog?.url || '';
}

function mapTrack(t: any): Track {
  const aw = String(t.artwork_url || t.user?.avatar_url || '').replace('-large', '-t500x500');
  return {
    id: `sc:${t.id}`,
    title: String(t.title || 'Untitled'),
    artist: String(t.user?.username || t.user?.full_name || 'Unknown'),
    artwork: aw,
    artworkLarge: aw,
    duration: Math.round((t.duration || t.full_duration || 0) / 1000),
    scStream: progressive(t),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const soundcloud = {
  /** Full-text search → tracks (carry scStream; resolve before playing). */
  searchTracks: async (q: string, limit = 25): Promise<Track[]> => {
    const j = await api(`/search/tracks?q=${encodeURIComponent(q)}&limit=${limit}`);
    const arr = (j?.collection || []) as Array<Record<string, unknown>>;
    return arr.filter((t) => t && (t as { media?: unknown }).media).map(mapTrack).filter((t) => t.scStream);
  },

  /** Genre charts (kind=top). genre is a SoundCloud key e.g. 'all-music','pop'. */
  trending: async (genre = 'all-music', limit = 25): Promise<Track[]> => {
    const j = await api(`/charts?kind=top&genre=soundcloud:genres:${genre}&limit=${limit}`);
    const arr = (j?.collection || []) as Array<{ track?: Record<string, unknown> }>;
    return arr.map((c) => c.track).filter((t) => t && (t as { media?: unknown }).media).map(mapTrack).filter((t) => t.scStream);
  },

  /** Resolve a progressive transcoding URL to a real, playable stream URL. */
  resolveStream: async (transcodingUrl: string): Promise<string | null> => {
    if (!transcodingUrl) return null;
    const cid = await clientId();
    if (!cid) return null;
    const t = await ddText(`${transcodingUrl}?client_id=${cid}`);
    if (!t) return null;
    try { const j = JSON.parse(t); return (j && typeof j.url === 'string') ? j.url : null; } catch { return null; }
  },
};
