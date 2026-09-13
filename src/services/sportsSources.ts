/**
 * Which upstream sports source to try first, and which not to bother with.
 *
 * THE PROBLEM THIS SOLVES, measured rather than guessed
 * The feed names a set of sources for each fixture, and the app tried them in
 * the order the feed returned. Sampling every source across 232 live fixtures
 * showed that order is close to worthless:
 *
 *     admin     listed on  80 fixtures   yielded a stream  8/8   (100%)
 *     golf      listed on  70 fixtures   yielded a stream  8/8   (100%)
 *     delta     listed on  67 fixtures   yielded a stream  4/8   (50%)
 *     echo      listed on 149 fixtures   yielded a stream  0/8   (0%)
 *     foxtrot   listed on   9 fixtures   yielded a stream  0/8   (0%)
 *
 * `echo` is named on MORE fixtures than anything else and never once produced a
 * stream. 90 of those 232 fixtures — 39% — were backed only by sources that
 * never yield, so they appeared in the app, took a tap, and played nothing.
 * Motorsport and F1 were the worst affected, which is exactly what was reported.
 *
 * WHY A PRIOR AND NOT A BLOCKLIST
 * Source health moves. `echo` may be repaired tomorrow and `admin` may rot, so
 * hardcoding today's measurement would bake in a snapshot and go stale the same
 * way the movie-server list did. The numbers above are a starting BELIEF, and
 * every real attempt on the device updates it. A source with a bad prior still
 * gets tried when nothing better is available — it is ordered last, not banned.
 */

const KEY = 'sahrae.sports.sourceRank.v1';

/**
 * Measured on 2026-09-13 against the live feed. Deliberately a starting point:
 * with enough local evidence, observation outweighs this entirely.
 */
const PRIOR: Record<string, number> = {
  admin: 0.95,
  golf: 0.95,
  delta: 0.50,
  echo: 0.05,
  foxtrot: 0.05,
};

/** An unknown source is assumed roughly average, so a new one gets a fair try. */
const UNKNOWN_PRIOR = 0.5;

/**
 * How much evidence before observation fully replaces the prior.
 *
 * With few attempts a run of bad luck should not condemn a good source, and one
 * lucky hit should not promote a bad one. At this many observations the prior's
 * weight has decayed to roughly half.
 */
const CONFIDENCE_K = 6;

export interface SourceStat {
  /** Attempts that produced at least one playable stream. */
  ok: number;
  /** Attempts that produced nothing. */
  fail: number;
  /** Epoch ms of the last success, for tie-breaking on recency. */
  lastOk: number;
}

type Table = Record<string, SourceStat>;

function read(): Table {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function write(t: Table): void {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* private mode */ }
}

export function priorFor(source: string): number {
  return PRIOR[source.toLowerCase()] ?? UNKNOWN_PRIOR;
}

/**
 * Belief that this source will yield a stream, 0..1.
 *
 * A weighted blend: the prior dominates while evidence is thin and fades as
 * attempts accumulate. This is the standard smoothing that stops a 1/1 record
 * from outranking a 40/41 one.
 */
export function scoreSource(source: string, table: Table = read()): number {
  const s = table[source.toLowerCase()];
  const prior = priorFor(source);
  if (!s) return prior;
  const n = s.ok + s.fail;
  if (n === 0) return prior;
  const observed = s.ok / n;
  const w = n / (n + CONFIDENCE_K); // 0 with no data, → 1 with plenty
  return observed * w + prior * (1 - w);
}

/**
 * Record what actually happened. `ok` means the source returned at least one
 * stream — not that the stream played, which is measured separately downstream.
 */
export function recordSourceOutcome(source: string, ok: boolean): void {
  if (!source) return;
  const key = source.toLowerCase();
  const t = read();
  const s = t[key] || { ok: 0, fail: 0, lastOk: 0 };
  if (ok) { s.ok += 1; s.lastOk = Date.now(); } else s.fail += 1;
  // Decay so a source can climb out of a bad night instead of being condemned
  // by ancient history — the same reason the movie-server ranking decays.
  if (s.ok + s.fail > 60) { s.ok = Math.round(s.ok / 2); s.fail = Math.round(s.fail / 2); }
  t[key] = s;
  write(t);
}

/**
 * Best-first ordering for one fixture's sources.
 *
 * Stable within equal scores, so the feed's own order still breaks ties and the
 * result is deterministic for a given set of beliefs.
 */
export function rankSources<T extends { source: string }>(sources: T[]): T[] {
  const t = read();
  return sources
    .map((s, i) => ({ s, i, score: scoreSource(s.source, t), lastOk: t[s.source.toLowerCase()]?.lastOk || 0 }))
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.02) return b.score - a.score;
      if (b.lastOk !== a.lastOk) return b.lastOk - a.lastOk;
      return a.i - b.i;
    })
    .map((x) => x.s);
}

/**
 * Is this fixture worth showing as playable?
 *
 * True when at least one of its sources is believed capable of producing a
 * stream. Used to mark the fixtures that would otherwise be a dead tap.
 */
export function likelyPlayable(sources: { source: string }[], threshold = 0.25): boolean {
  if (!sources?.length) return false;
  const t = read();
  return sources.some((s) => scoreSource(s.source, t) >= threshold);
}

/** Everything learned so far — for diagnostics. */
export function sourceTable(): Table { return read(); }

/** Forget it all, for when the upstream changes shape. */
export function resetSourceRank(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
