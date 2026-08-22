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

export interface FeedTeam { name?: string; badge?: string }

export interface FeedEvent {
  id: string;
  title: string;
  category: string;
  date: number;
  popular?: boolean;
  live?: boolean;
  teams?: { home?: FeedTeam; away?: FeedTeam } | null;
  /** Ready-to-play embed URLs. */
  embeds?: string[];
  /** Per-stream detail from the API: real quality/language, never guessed. */
  streamMeta?: { embedUrl: string; hd: boolean; language?: string; source: string; streamNo: number }[];
}

export interface Feed { events: FeedEvent[] }

const API_BASE = 'https://streamed.pk/api';
/** Snapshot in our own repo — only used when the API cannot be reached. */
const FALLBACK_URLS = [
  'https://raw.githubusercontent.com/adr1an-ma1na/sahrae-sports-feed/main/feed.json',
  'https://cdn.jsdelivr.net/gh/adr1an-ma1na/sahrae-sports-feed@main/feed.json',
];
const CACHE_KEY = 'sahrae.sportsFeed.v2';
const CACHE_TTL_MS = 5 * 60_000;

interface ApiSource { source: string; id: string }
interface ApiMatch {
  id: string;
  title: string;
  category: string;
  date: number;
  popular?: boolean;
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
 * Embed URLs for one match.
 *
 * `/api/stream/{source}/{id}` returns the exact embedUrl per stream plus real
 * `hd` and `language` flags — so quality labels come from the provider rather
 * than being inferred, which is the rule the reliability brief sets out. If that
 * call fails we fall back to the documented URL shape rather than dropping the
 * match entirely.
 */
export async function fetchStreamsFor(source: string, id: string): Promise<FeedEvent['streamMeta']> {
  const rows = await getJson<{ embedUrl: string; hd: boolean; language?: string; source: string; streamNo: number }[]>(
    `${API_BASE}/stream/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
    9000,
  );
  if (Array.isArray(rows) && rows.length) return rows;
  return [{ embedUrl: `https://embed.st/embed/${source}/${id}/1`, hd: false, source, streamNo: 1 }];
}

function toFeedEvent(m: ApiMatch, live: boolean): FeedEvent {
  // One embed per source up-front (stream 1). The per-stream detail is fetched
  // lazily when the event is opened, so listing 300 matches does not fire 300
  // extra requests.
  const embeds = (m.sources || []).map((s) => `https://embed.st/embed/${s.source}/${s.id}/1`);
  return {
    id: m.id,
    title: m.title,
    category: m.category,
    date: m.date,
    popular: m.popular,
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

  const [all, live] = await Promise.all([
    getJson<ApiMatch[]>(`${API_BASE}/matches/all`),
    getJson<ApiMatch[]>(`${API_BASE}/matches/live`),
  ]);

  if (Array.isArray(all) && all.length) {
    const liveIds = new Set((live || []).map((m) => m.id));
    sourcesById.clear();
    for (const m of all) if (m.sources?.length) sourcesById.set(m.id, m.sources);
    for (const m of live || []) if (m.sources?.length) sourcesById.set(m.id, m.sources);

    // `live` occasionally carries a match `all` has not picked up yet.
    const merged = new Map<string, ApiMatch>();
    for (const m of all) merged.set(m.id, m);
    for (const m of live || []) if (!merged.has(m.id)) merged.set(m.id, m);

    const feed: Feed = {
      events: Array.from(merged.values()).map((m) => toFeedEvent(m, liveIds.has(m.id))),
    };
    writeCache(feed);
    return feed;
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
