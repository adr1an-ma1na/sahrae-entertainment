/**
 * Skip Intro / Skip Recap / Next Episode, as aniwatch and Netflix have them
 * (owner, 2026-11-12).
 *
 * Where the timestamps come from, both free and without a key:
 *  - TheIntroDB (api.theintrodb.org/v3/media), community timestamps by TMDB id:
 *    intro, recap, credits and preview, for series, anime and films. It answers
 *    the website and the app (it echoes the page's origin), up to 30 requests
 *    every 10 s and 5,000 a day for each viewer.
 *  - AniSkip (api.aniskip.com/v2/skip-times), the database aniwatch-style sites
 *    use, keyed by MyAnimeList id. Asked only for anime TheIntroDB does not
 *    know; the TMDB → MyAnimeList id comes from arm.haglund.dev.
 * Measured 2026-11-12: both gave Jujutsu Kaisen S1E2's opening as 5:45–7:14.
 *
 * Times are seconds. A missing end runs to the end of the episode.
 */

export type SegmentKind = 'intro' | 'recap' | 'credits' | 'preview';
export interface Segment { kind: SegmentKind; start: number; end: number | null }

const KINDS: SegmentKind[] = ['intro', 'recap', 'credits', 'preview'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** TheIntroDB's answer: `{intro:[{start_ms,end_ms}], recap, credits, preview}`. */
export function parseIntroDb(raw: unknown): Segment[] {
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const out: Segment[] = [];
  for (const kind of KINDS) {
    const list = o[kind];
    if (!Array.isArray(list)) continue;
    for (const x of list.slice(0, 4)) {
      const s = num((x as { start_ms?: unknown })?.start_ms);
      const e = num((x as { end_ms?: unknown })?.end_ms);
      // An intro with no start opens the episode; anything else needs one.
      const start = s === null ? (kind === 'intro' || kind === 'recap' ? 0 : null) : s / 1000;
      if (start === null) continue;
      const end = e === null ? null : e / 1000;
      if (end !== null && end - start < 3) continue;
      out.push({ kind, start, end });
    }
  }
  return tidy(out);
}

const ANISKIP: Record<string, SegmentKind> = { op: 'intro', 'mixed-op': 'intro', recap: 'recap', ed: 'credits', 'mixed-ed': 'credits' };

/** AniSkip's answer: `{found, results:[{interval:{startTime,endTime}, skipType}]}`. */
export function parseAniSkip(raw: unknown): Segment[] {
  const o = raw as { found?: unknown; results?: unknown } | null;
  if (!o || o.found !== true || !Array.isArray(o.results)) return [];
  const out: Segment[] = [];
  for (const r of o.results.slice(0, 8)) {
    const kind = ANISKIP[String((r as { skipType?: unknown })?.skipType)];
    const iv = (r as { interval?: { startTime?: unknown; endTime?: unknown } })?.interval;
    const start = num(iv?.startTime), end = num(iv?.endTime);
    if (!kind || start === null || end === null || end - start < 3) continue;
    out.push({ kind, start, end });
  }
  return tidy(out);
}

function tidy(list: Segment[]): Segment[] {
  return list.sort((a, b) => a.start - b.start);
}

/** What the button should offer at second `t`, if anything. */
export function segmentAt(segments: Segment[], t: number, duration = 0): Segment | null {
  if (!(t >= 0)) return null;
  for (const s of segments) {
    const end = s.end ?? (duration > 0 ? duration : Infinity);
    // Not in the last second of it: the button would vanish as it was pressed.
    if (t >= s.start && t < end - 1) return s;
  }
  return null;
}

/** Where pressing Skip lands: the end of the part, or the end of the episode. */
export function skipTarget(s: Segment, duration = 0): number | null {
  if (s.end !== null) return s.end;
  return duration > 0 ? Math.max(0, duration - 0.5) : null;
}

export interface SegmentQuery {
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  /** Japanese animation: worth asking AniSkip when TheIntroDB has nothing. */
  anime?: boolean;
}

const cache = new Map<string, Promise<Segment[]>>();

async function getJson(url: string, ms = 6000): Promise<unknown> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl?.signal, credentials: 'omit' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

async function fromAniSkip(q: SegmentQuery): Promise<Segment[]> {
  if (q.type !== 'tv' || !q.episode) return [];
  const map = await getJson(`https://arm.haglund.dev/api/v2/themoviedb?id=${q.tmdbId}`);
  if (!Array.isArray(map)) return [];
  type Arm = { myanimelist?: unknown; 'themoviedb-season'?: unknown };
  const rows = map as Arm[];
  const hit = rows.find((r) => r['themoviedb-season'] === (q.season || 1)) || (rows.length === 1 ? rows[0] : undefined);
  const mal = hit && typeof hit.myanimelist === 'number' ? hit.myanimelist : null;
  if (!mal) return [];
  const types = ['op', 'ed', 'recap', 'mixed-op', 'mixed-ed'].map((x) => `types=${x}`).join('&');
  return parseAniSkip(await getJson(`https://api.aniskip.com/v2/skip-times/${mal}/${q.episode}?${types}&episodeLength=0`));
}

/** The skippable parts of a film or episode; empty when nobody has marked them. Never throws. */
export function loadSegments(q: SegmentQuery): Promise<Segment[]> {
  if (!q.tmdbId) return Promise.resolve([]);
  const key = `${q.type}:${q.tmdbId}:${q.season || 0}:${q.episode || 0}`;
  const had = cache.get(key);
  if (had) return had;
  const url = q.type === 'tv'
    ? `https://api.theintrodb.org/v3/media?tmdb_id=${q.tmdbId}&season=${q.season || 1}&episode=${q.episode || 1}`
    : `https://api.theintrodb.org/v3/media?tmdb_id=${q.tmdbId}`;
  const p = (async () => {
    const segs = parseIntroDb(await getJson(url));
    if (segs.some((s) => s.kind === 'intro') || !q.anime) return segs;
    const more = await fromAniSkip(q);
    return more.length ? more : segs;
  })().catch(() => [] as Segment[]);
  cache.set(key, p);
  if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  return p;
}

/** The words on the button. */
export function skipLabel(s: Segment, hasNext: boolean): string | null {
  if (s.kind === 'intro') return 'Skip Intro';
  if (s.kind === 'recap') return 'Skip Recap';
  // The end of an episode: on to the next one, as Netflix does. A film's credits are left to roll.
  return hasNext ? 'Next Episode' : null;
}
