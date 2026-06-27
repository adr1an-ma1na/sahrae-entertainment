import { Track } from './ytmusic';

/**
 * Podcasts from real RSS feeds (open, legal, direct MP3 files) — NOT YouTube.
 * Shows are discovered via the free iTunes Search API; episodes come from the
 * show's RSS feed. Each episode Track carries `audioUrl` (the enclosure MP3), so
 * the player routes it to the <audio> element → it plays in the BACKGROUND and
 * can be downloaded. Feeds are usually not CORS-open, so we fetch through the
 * native /__ddfetch passthrough (falls back to direct for the browser preview).
 */

export interface PodShow { id: string; title: string; author: string; artwork: string; feedUrl: string }

async function fetchText(url: string): Promise<string | null> {
  // Try the native passthrough first (no CORS, works in the APK), then direct.
  try {
    const r = await fetch(`https://localhost/__ddfetch?u=${encodeURIComponent(url)}`, { cache: 'no-store' });
    if (r.ok) { const t = await r.text(); if (t) return t; }
  } catch { /* not native / not reachable */ }
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) return await r.text();
  } catch { /* give up */ }
  return null;
}

/** Search podcast SHOWS by name/topic (iTunes Search API, key-less). */
export async function searchPodcastShows(query: string, limit = 24): Promise<PodShow[]> {
  const t = await fetchText(`https://itunes.apple.com/search?media=podcast&limit=${limit}&term=${encodeURIComponent(query)}`);
  if (!t) return [];
  let j: { results?: Array<Record<string, unknown>> };
  try { j = JSON.parse(t); } catch { return []; }
  return (j.results || [])
    .filter((r) => r.feedUrl)
    .map((r) => ({
      id: String(r.collectionId ?? r.feedUrl),
      title: String(r.collectionName ?? 'Podcast'),
      author: String(r.artistName ?? ''),
      artwork: String(r.artworkUrl600 ?? r.artworkUrl100 ?? ''),
      feedUrl: String(r.feedUrl),
    }));
}

function durationToSec(s: string): number {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map((x) => Number(x));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function tagText(el: Element | Document, tag: string): string {
  const e = el.getElementsByTagName(tag)[0];
  return e?.textContent?.trim() || '';
}

/** Fetch + parse a show's RSS feed into episode Tracks (newest first). */
export async function getPodcastEpisodes(feedUrl: string, fallback?: Partial<PodShow>): Promise<Track[]> {
  const xml = await fetchText(feedUrl);
  if (!xml) return [];
  let doc: Document;
  try { doc = new DOMParser().parseFromString(xml, 'application/xml'); } catch { return []; }
  if (doc.getElementsByTagName('parsererror').length) return [];

  const channel = doc.getElementsByTagName('channel')[0] || doc;
  const showTitle = tagText(channel, 'title') || fallback?.title || 'Podcast';
  // Channel artwork: <itunes:image href> or <image><url>.
  const chImgEl = channel.getElementsByTagName('itunes:image')[0];
  const channelArt = chImgEl?.getAttribute('href') || tagText(channel, 'url') || fallback?.artwork || '';

  const items = Array.from(doc.getElementsByTagName('item'));
  const eps: Track[] = [];
  for (const it of items) {
    const enc = it.getElementsByTagName('enclosure')[0];
    let audioUrl = enc?.getAttribute('url') || '';
    if (!audioUrl) {
      // Some feeds use <media:content> instead of <enclosure>.
      const media = it.getElementsByTagName('media:content');
      for (let k = 0; k < media.length; k++) {
        const ty = media[k].getAttribute('type') || '';
        const mu = media[k].getAttribute('url') || '';
        if (mu && (ty.startsWith('audio') || /\.(mp3|m4a|aac|ogg|oga)(\?|$)/i.test(mu))) { audioUrl = mu; break; }
      }
    }
    if (!audioUrl) continue; // no media → skip
    audioUrl = audioUrl.replace(/^http:\/\//i, 'https://'); // https app can't play http media
    const title = tagText(it, 'title') || 'Episode';
    const pub = tagText(it, 'pubDate');
    const uploaded = pub ? Date.parse(pub) : 0;
    const guid = tagText(it, 'guid') || audioUrl;
    const epImgEl = it.getElementsByTagName('itunes:image')[0];
    const art = (epImgEl?.getAttribute('href') || channelArt).replace(/^http:\/\//i, 'https://');
    const dur = durationToSec(tagText(it, 'itunes:duration'));
    // Show notes: prefer full HTML (<content:encoded>), then <description>, then itunes:summary.
    const description = tagText(it, 'content:encoded') || tagText(it, 'description') || tagText(it, 'itunes:summary');
    // Inline Podlove Simple Chapters (<psc:chapter start="HH:MM:SS" title="…">), if present.
    const chapters: { start: number; title: string }[] = [];
    const pscList = it.getElementsByTagName('psc:chapter');
    for (let k = 0; k < pscList.length; k++) {
      const st = pscList[k].getAttribute('start') || '';
      const ti = pscList[k].getAttribute('title') || '';
      if (st && ti) chapters.push({ start: durationToSec(st), title: ti });
    }
    // <podcast:chapters url="…" /> JSON — fetched on demand when the detail opens.
    const chaptersUrl = (it.getElementsByTagName('podcast:chapters')[0]?.getAttribute('url') || '').replace(/^http:\/\//i, 'https://') || undefined;
    eps.push({
      id: `pod:${guid}`,
      title,
      artist: showTitle,
      artwork: art,
      artworkLarge: art,
      duration: dur,
      audioUrl,
      feedUrl,
      date: uploaded ? new Date(uploaded).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '',
      uploaded: uploaded || 0,
      description,
      chapters: chapters.length ? chapters : undefined,
      chaptersUrl,
    });
  }
  return eps;
}

/** Fetch + parse a <podcast:chapters> JSON file into {start,title} chapters. */
export async function fetchChapters(url: string): Promise<{ start: number; title: string }[]> {
  const txt = await fetchText(url);
  if (!txt) return [];
  try {
    const j = JSON.parse(txt) as { chapters?: { startTime?: number; title?: string }[] };
    const arr = Array.isArray(j.chapters) ? j.chapters : [];
    return arr
      .map((c) => ({ start: Math.floor(Number(c.startTime) || 0), title: String(c.title || '').trim() }))
      .filter((c) => c.title);
  } catch { return []; }
}
