import { recordSourceOutcome, rankSources } from './sportsSources.ts';
/**
 * Live sports fixtures.
 *
 * WHY THIS REPLACED THE STATIC FILE. The app read a `feed.json` committed to our
 * own GitHub repo. Measured on 2026-08-21: 356 events, of which only 34 (10%)
 * carried any stream. The upstream API the file is generated FROM had, at the
 * same moment, 312 events with 312 carrying streams — 100%. The sparse listings,
 * the drifting kick-off times and the "opens with nothing to watch" reports were
 * all the staleness of a snapshot, not a bad provider.
 *
 * So this queries the live API and keeps the committed file as an offline
 * fallback only. Same source, used properly.
 *
 * Verified CORS-clean from the app origin, so it works on the PWA as well as in
 * the Android shell (which could have proxied around it anyway).
 */

export interface FeedTeam { name?: string; badge?: string; /** Team colour, when the source has no crest. */ color?: string }

export interface FeedEvent {
  id: string;
  title: string;
  category: string;
  date: number;
  popular?: boolean;
  /** The API's match artwork, as an absolute https URL. */
  poster?: string;
  /** Competition, as the source names it ("Serie A", "NBA", "24/7 channel"). */
  league?: string;
  live?: boolean;
  teams?: { home?: FeedTeam; away?: FeedTeam } | null;
  /** Ready-to-play embed URLs. */
  embeds?: string[];
  /** Per-stream detail from the API: real quality/language, never guessed. */
  streamMeta?: { embedUrl: string; hd: boolean; language?: string; source: string; streamNo: number; viewers?: number }[];
}

export interface Feed { events: FeedEvent[] }

const API_BASE = 'https://streamed.pk/api';
/** Snapshot in our own repo — only used when the API cannot be reached. */
const FALLBACK_URLS = [
  'https://raw.githubusercontent.com/adr1an-ma1na/sahrae-sports-feed/main/feed.json',
  'https://cdn.jsdelivr.net/gh/adr1an-ma1na/sahrae-sports-feed@main/feed.json',
];
const CACHE_KEY = 'sahrae.sportsFeed.v3'; // v3: ppv.st, after Streamed closed
const CACHE_TTL_MS = 5 * 60_000;

interface ApiSource { source: string; id: string }
interface ApiMatch {
  id: string;
  title: string;
  category: string;
  date: number;
  popular?: boolean;
  poster?: string;
  teams?: { home?: FeedTeam; away?: FeedTeam } | null;
  sources?: ApiSource[];
}

async function getJson<T>(url: string, timeoutMs = 12000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Real streams for one match, from one source.
 *
 * `/api/stream/{source}/{id}` returns the exact embedUrl per stream plus real
 * `hd` and `language` flags — so quality labels come from the provider rather
 * than being inferred.
 *
 * IT NO LONGER INVENTS A URL WHEN THE ANSWER IS EMPTY.
 * This used to end with a fabricated `/embed/{source}/{id}/1` whenever the API
 * returned nothing, on the theory that a guess beat dropping the match. It does
 * not. The `echo` source is named on 149 of 232 live fixtures and returns an
 * empty list every single time, so that line manufactured a dead "Server 1" for
 * two fifths of the schedule — motorsport and F1 worst of all. The viewer got a
 * list of servers where none of them opened, which is the exact complaint this
 * file's own comment describes a few lines further down without connecting it.
 *
 * An empty answer is information. It is now returned as an empty list, recorded
 * against the source so the ranking learns, and the caller moves to the next
 * source instead of offering a link nobody has any reason to believe in.
 */
export async function fetchStreamsFor(source: string, id: string): Promise<FeedEvent['streamMeta']> {
  const rows = await getJson<{ embedUrl: string; hd: boolean; language?: string; source: string; streamNo: number; viewers?: number }[]>(
    `${API_BASE}/stream/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
    9000,
  );
  const got = Array.isArray(rows) && rows.length > 0;
  recordSourceOutcome(source, got);
  return got ? rows! : [];
}

function toFeedEvent(m: ApiMatch, live: boolean): FeedEvent {
  // One embed per source up-front (stream 1). The per-stream detail is fetched
  // lazily when the event is opened, so listing 300 matches does not fire 300
  // extra requests.
  //
  // Ranked, because the feed's own order is not informative: the source it names
  // most often is the one that never yields a stream. Best-believed first means
  // the first thing tried is the thing most likely to play.
  const embeds = rankSources(m.sources || []).map((s) => `https://embed.st/embed/${s.source}/${s.id}/1`);
  return {
    id: m.id,
    title: m.title,
    category: m.category,
    date: m.date,
    popular: m.popular,
    poster: m.poster && m.poster.startsWith('/') ? 'https://streamed.pk' + m.poster : undefined,
    live,
    teams: m.teams,
    embeds,
  };
}

/** The API's source list for a match, needed to expand streams on open. */
export const sourcesById = new Map<string, ApiSource[]>();

function readCache(): Feed | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, feed } = JSON.parse(raw);
    if (!feed || !Array.isArray(feed.events)) return null;
    return Date.now() - at < CACHE_TTL_MS ? feed : null;
  } catch {
    return null;
  }
}

function writeCache(feed: Feed) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), feed }));
  } catch { /* cache is advisory */ }
}

/** Last known good feed, ignoring TTL — so a failed refresh never blanks the screen. */
function readStaleCache(): Feed | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { feed } = JSON.parse(raw);
    return feed && Array.isArray(feed.events) ? feed : null;
  } catch {
    return null;
  }
}

/**
 * Fixtures, freshest source first:
 *   1. in-memory/localStorage cache inside its TTL (instant open)
 *   2. the live API — `all` for the schedule, `live` to mark what is on air now
 *   3. the committed snapshot
 *   4. a stale cache, rather than an empty screen
 */
export async function loadSportsFeed(): Promise<Feed> {
  const cached = readCache();
  if (cached) return cached;

  // Streamed (streamed.pk) closed on 2026-10-26 ("We are no longer operating
  // Streamed") and every API address now forwards to that notice, so the
  // schedule comes from ppv.st, the first site Streamed points to. Its feed is
  // public and CORS-open.
  const ppv = await loadPpvFeed();
  if (ppv && ppv.events.length) {
    writeCache(ppv);
    return ppv;
  }

  for (const url of FALLBACK_URLS) {
    const snapshot = await getJson<Feed | FeedEvent[]>(url, 15000);
    if (snapshot) {
      const feed: Feed = Array.isArray(snapshot) ? { events: snapshot } : snapshot;
      if (Array.isArray(feed.events) && feed.events.length) return feed;
    }
  }

  return readStaleCache() || { events: [] };
}

// ── ppv.st ───────────────────────────────────────────────────────────────
interface PpvStream {
  id: number; name: string; tag?: string; poster?: string; uri_name?: string;
  starts_at: number; ends_at: number; always_live?: number; category_name?: string;
  iframe?: string; viewers?: string | number; colors?: string[];
}
const PPV_API = 'https://api.ppv.st/api/streams';

/** ppv.st's sport names onto the app's categories. Not sport (cartoons, 24/7 shows): dropped. */
export function ppvCategory(name: string): string | null {
  const n = (name || '').toLowerCase();
  if (n === 'football' || n === 'soccer') return 'football';
  if (n.includes('american football')) return 'american-football';
  if (n.includes('basketball')) return 'basketball';
  if (n.includes('baseball')) return 'baseball';
  if (n.includes('hockey')) return 'hockey';
  if (n.includes('cricket')) return 'cricket';
  if (n.includes('tennis')) return 'tennis';
  if (n.includes('golf')) return 'golf';
  if (n.includes('rugby') || n.includes('australian football')) return 'rugby';
  if (n.includes('motor') || n.includes('formula') || n.includes('racing') || n.includes('f1')) return 'motor-sports';
  if (n.includes('wrestling') || n.includes('mma') || n.includes('ufc') || n.includes('boxing') || n.includes('combat') || n.includes('fight')) return 'fight';
  if (n.includes('darts')) return 'darts';
  if (n.includes('24/7')) return null;
  return 'other';
}

const HEX = /^#[0-9a-f]{6}$/i;
function withColors(t: FeedEvent['teams'], colors?: string[]): FeedEvent['teams'] {
  if (!t || !Array.isArray(colors)) return t;
  return {
    home: { ...t.home, color: HEX.test(colors[0] || '') ? colors[0] : undefined },
    away: { ...t.away, color: HEX.test(colors[1] || '') ? colors[1] : undefined },
  };
}

/** "Sassuolo vs. Lazio" → home Sassuolo, away Lazio. */
export function ppvTeams(name: string): FeedEvent['teams'] {
  const m = (name || '').match(/^(.+?)\s+(?:vs\.?|v\.?|@)\s+(.+)$/i);
  return m ? { home: { name: m[1].trim() }, away: { name: m[2].trim() } } : null;
}

export function ppvToEvent(s: PpvStream, category: string, nowSec: number): FeedEvent | null {
  if (!s.iframe || !/^https:\/\//.test(s.iframe)) return null;
  const always = !!s.always_live;
  const live = always || (s.starts_at > 0 && s.starts_at <= nowSec && nowSec <= (s.ends_at || s.starts_at + 3 * 3600));
  return {
    id: `ppv-${s.id}`,
    title: s.name,
    category,
    // A 24/7 channel has no kick-off; 0 keeps it listed as always on.
    date: always || !s.starts_at ? 0 : s.starts_at * 1000,
    popular: Number(s.viewers || 0) >= 500,
    poster: s.poster && /^https:\/\//.test(s.poster) ? s.poster : undefined,
    league: s.tag || undefined,
    live,
    teams: withColors(ppvTeams(s.name), s.colors),
    embeds: [s.iframe],
  };
}

async function loadPpvFeed(): Promise<Feed | null> {
  const j = await getJson<{ streams?: { category: string; streams: PpvStream[] }[] }>(PPV_API, 15000);
  if (!j || !Array.isArray(j.streams)) return null;
  const now = Date.now() / 1000;
  const events: FeedEvent[] = [];
  const hosts = new Set<string>();
  for (const group of j.streams) {
    const cat = ppvCategory(group.category);
    if (!cat) continue;
    for (const st of group.streams || []) {
      const e = ppvToEvent(st, cat, now);
      if (!e) continue;
      events.push(e);
      try { hosts.add(new URL(st.iframe!).hostname); } catch { /* skip */ }
    }
  }
  shareEmbedHosts([...hosts]);
  return { events };
}

/** Tell the Android app the player's site, so it plays like the built-in hosts (it moves domains). */
function shareEmbedHosts(hosts: string[]) {
  const caps = (window as unknown as { __sahraeCaps?: { embedHosts?: boolean } }).__sahraeCaps;
  if (!caps?.embedHosts || !hosts.length) return;
  fetch(`https://localhost/__embedhosts?h=${encodeURIComponent(hosts.join(','))}`, { cache: 'no-store' }).catch(() => {});
}
