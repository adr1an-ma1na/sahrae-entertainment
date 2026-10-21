import { COMPETITIONS, dayToken, parseEvent, type Competition, type Fixture } from './matchdayCore';

export * from './matchdayCore';

/**
 * Fixtures, live scores and odds for the matchday screen, from ESPN's public
 * scoreboard (no key, open to browsers).
 *
 * ESPN limits requests per network address, and viewers on one mobile network
 * often share an address, so this asks for little: one day per competition
 * per request (ranges are refused as of Oct 2026), at most CONCURRENCY at a
 * time, each kept for CACHE_MS. Only today is refreshed while matches are on.
 */

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const CACHE_KEY = 'sahrae.matchday.v1';
const CACHE_MS = 10 * 60 * 1000;
const LIVE_MS = 60 * 1000;
const CONCURRENCY = 3;
const TIMEOUT_MS = 9000;

type Cache = Record<string, { at: number; fixtures: Fixture[] }>;

let cache: Cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch { cache = {}; }
const save = () => {
  // Keep only the last few days so storage stays small.
  const cutoff = Date.now() - 3 * 86400000;
  for (const [k, v] of Object.entries(cache)) if (v.at < cutoff) delete cache[k];
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* full: memory still holds it */ }
};

async function getJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

async function loadOne(c: Competition, day: string | null, maxAge: number): Promise<Fixture[]> {
  const key = `${c.code}|${day ?? 'now'}`;
  const hit = cache[key];
  if (hit && Date.now() - hit.at < maxAge) return hit.fixtures;
  const path = c.sport === 'racing' ? `racing/${c.code}/scoreboard` : `soccer/${c.code}/scoreboard${day ? `?dates=${day}` : ''}`;
  const j = (await getJson(`${BASE}/${path}`)) as { events?: unknown[] } | null;
  if (!j || !Array.isArray(j.events)) return hit?.fixtures ?? [];
  const fixtures = j.events.map((e) => parseEvent(e, c)).filter((f): f is Fixture => !!f);
  cache[key] = { at: Date.now(), fixtures };
  save();
  return fixtures;
}

async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); }
  }));
  return out;
}

/**
 * Fixtures from today through `days` ahead (and anything still live from
 * yesterday), soonest first, without duplicates. `fresh` refreshes today only.
 */
export async function loadMatchday(days = 3, fresh = false, competitions: Competition[] = COMPETITIONS): Promise<Fixture[]> {
  const now = Date.now();
  const tokens = Array.from({ length: days + 1 }, (_, i) => dayToken(now + i * 86400000));
  const jobs: (() => Promise<Fixture[]>)[] = [];
  for (const c of competitions) {
    if (c.sport === 'racing') { jobs.push(() => loadOne(c, null, fresh ? LIVE_MS : CACHE_MS)); continue; }
    tokens.forEach((d, i) => jobs.push(() => loadOne(c, d, fresh && i === 0 ? LIVE_MS : CACHE_MS)));
  }
  const all = (await pool(jobs, CONCURRENCY)).flat();
  const seen = new Set<string>();
  return all
    .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .filter((f) => f.state === 'in' || f.date > now - 3 * 3600000)
    .sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || a.date - b.date);
}
