import type { Track } from './ytmusic';

/**
 * Podcast EPISODES from the iTunes lookup API.
 *
 * Why this exists alongside podcastRss.ts: podcast RSS feeds are almost never
 * CORS-open. Measured against the six feeds iTunes returns for "news"
 * (NPR, BBC, Simplecast, Megaphone x2): every one answers 200 to curl and none
 * of them send `Access-Control-Allow-Origin`. So the RSS path works in the APK
 * (which proxies through /__ddfetch) and silently returns nothing in the PWA —
 * which is where most people open the app.
 *
 * `lookup?entity=podcastEpisode` returns the same thing the feed does — title,
 * a direct `episodeUrl` MP3, duration, artwork, show notes, release date — and
 * it DOES send `Access-Control-Allow-Origin: *`. So it works on every platform
 * with no proxy, no key and no quota.
 *
 * RSS stays as the enrichment pass (deeper back-catalogue, chapters), and is
 * merged over the top wherever it is actually reachable. iTunes caps a lookup
 * at 200 episodes; shows with more than that need the feed for the tail.
 *
 * Note the audio itself never needed a proxy: <audio> loads cross-origin media
 * without CORS. Only the metadata fetch was ever blocked.
 */

const LOOKUP_LIMIT = 200; // iTunes' documented ceiling for this entity

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

/**
 * Strip podcast tracking prefixes off an episode URL.
 *
 * Publishers chain analytics redirectors in front of the real file:
 *
 *   https://pdst.fm/e/pscrb.fm/rss/p/mgln.ai/e/1390/claritaspod.com/measure/
 *     p.podderapp.com/…/episode.flightcast.com/01M0AAXF9ND…​.mp3
 *
 * Every hop is a tracker domain, and tracker domains are exactly what a content
 * blocker blocks — Brave's shields, uBlock, a pi-hole. When one of them is
 * blocked the whole chain dies and the episode simply never loads, which is the
 * failure this was written for. The real file is sitting in plain sight at the
 * end of the path.
 *
 * Unwrapping also drops six redirects to one, so episodes start faster.
 *
 * Conservative by construction: it only rewrites when the path ends in an audio
 * extension AND contains an embedded hostname, and the original is kept as a
 * fallback (see `audioUrlAlt`) because a few publishers sign the chain and only
 * serve through it.
 */
export function unwrapTrackingUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { return raw; }
  if (!AUDIO_EXT.test(u.pathname)) return raw;

  const parts = u.pathname.split('/').filter(Boolean);
  // Walk back for the last segment shaped like a hostname; the rest is the path.
  for (let i = parts.length - 2; i >= 0; i--) {
    const seg = parts[i];
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(seg) && /\.[a-z]{2,}$/i.test(seg)) {
      return `https://${seg}/${parts.slice(i + 1).join('/')}${u.search}`;
    }
  }
  return raw;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Direct fetch first (iTunes is CORS-open, so this is the fast path
 *  everywhere), then the native passthrough as a fallback for locked-down
 *  networks in the APK. This is the reverse of podcastRss.ts's order, which is
 *  correct here: /__ddfetch only exists in the APK, and trying it first costs
 *  the PWA a guaranteed failed request on every single call. */
async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch { /* offline, or a network that blocks Apple — try native */ }
  try {
    const r = await fetch(`https://localhost/__ddfetch?u=${encodeURIComponent(url)}`, { cache: 'no-store' });
    if (r.ok) { const t = await r.text(); if (t) return JSON.parse(t); }
  } catch { /* not native */ }
  return null;
}

function mapEpisode(r: any, showTitle: string, showArt: string, feedUrl?: string): Track | null {
  const tracked = String(r.episodeUrl || '').replace(/^http:\/\//i, 'https://');
  if (!tracked) return null; // no media → not playable, so not an episode we can offer
  const audioUrl = unwrapTrackingUrl(tracked);

  const art = String(r.artworkUrl600 || r.artworkUrl160 || r.artworkUrl60 || showArt || '')
    .replace(/^http:\/\//i, 'https://');
  const released = r.releaseDate ? Date.parse(r.releaseDate) : 0;

  return {
    // Same `pod:` prefix podcastRss.ts uses, keyed on the same guid where iTunes
    // exposes one, so follows/progress/downloads saved from either source line
    // up on the same episode instead of duplicating it.
    id: `pod:${r.episodeGuid || audioUrl}`,
    title: String(r.trackName || 'Episode'),
    artist: String(r.collectionName || showTitle || 'Podcast'),
    artwork: art,
    artworkLarge: art,
    duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0,
    audioUrl,
    // Only when unwrapping actually changed something — a publisher that signs
    // the tracking chain will 403 the direct URL, and the player retries this.
    audioUrlAlt: audioUrl !== tracked ? tracked : undefined,
    feedUrl: feedUrl || String(r.feedUrl || '') || undefined,
    date: released ? new Date(released).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '',
    uploaded: released || 0,
    description: String(r.description || ''),
  };
}

/**
 * Episodes for a show, newest first. `collectionId` is the numeric iTunes id
 * carried on PodShow. Returns [] rather than throwing so a dead network
 * degrades to "no episodes yet" instead of taking the page down.
 */
export async function getEpisodesById(collectionId: string, limit = LOOKUP_LIMIT): Promise<Track[]> {
  if (!/^\d+$/.test(collectionId)) return []; // feedUrl-keyed show — RSS is the only route
  const n = Math.min(Math.max(1, limit), LOOKUP_LIMIT);
  const j = await fetchJson(`https://itunes.apple.com/lookup?id=${collectionId}&entity=podcastEpisode&limit=${n}`);
  const results: any[] = Array.isArray(j?.results) ? j.results : [];
  if (!results.length) return [];

  // results[0] is the show itself; the episodes follow it.
  const show = results.find((r) => r.wrapperType === 'track' || r.kind === 'podcast') || {};
  const showTitle = String(show.collectionName || '');
  const showArt = String(show.artworkUrl600 || show.artworkUrl100 || '');
  const feedUrl = String(show.feedUrl || '') || undefined;

  const out: Track[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.wrapperType !== 'podcastEpisode') continue;
    const t = mapEpisode(r, showTitle, showArt, feedUrl);
    if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
  }
  return out.sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0));
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Merge an RSS pass over an iTunes pass.
 *
 * iTunes wins on ordering and is the trusted spine (it is what actually
 * resolved). RSS entries the lookup didn't carry are appended — that is the
 * back-catalogue past iTunes' 200 cap. Where both describe the same episode,
 * RSS fields that iTunes lacks (chapters, full HTML show notes, a real duration)
 * are folded in without overwriting anything iTunes already got right.
 */
export function mergeEpisodes(primary: Track[], extra: Track[]): Track[] {
  if (!extra.length) return primary;
  if (!primary.length) return extra;

  // Match on id first, then on audio URL — the same episode routinely carries a
  // different guid in the feed than the one iTunes reports.
  const byId = new Map<string, Track>();
  const byAudio = new Map<string, Track>();
  for (const t of primary) {
    byId.set(t.id, t);
    if (t.audioUrl) byAudio.set(t.audioUrl, t);
  }

  const appended: Track[] = [];
  for (const e of extra) {
    const hit = byId.get(e.id) || (e.audioUrl ? byAudio.get(e.audioUrl) : undefined);
    if (!hit) { appended.push(e); continue; }
    if (!hit.chapters && e.chapters) hit.chapters = e.chapters;
    if (!hit.chaptersUrl && e.chaptersUrl) hit.chaptersUrl = e.chaptersUrl;
    if (e.description && e.description.length > (hit.description || '').length) hit.description = e.description;
    if (!hit.duration && e.duration) hit.duration = e.duration;
    if (!hit.feedUrl && e.feedUrl) hit.feedUrl = e.feedUrl;
  }

  return [...primary, ...appended.sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0))];
}
