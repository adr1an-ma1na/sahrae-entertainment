/**
 * Learns which movie/series servers actually work, per device.
 *
 * These are third-party iframe embeds, and two things follow from that:
 *
 *   1. We cannot detect success directly. The iframe is cross-origin, so the
 *      page cannot see whether it loaded a player or an error. There is no
 *      onerror to listen to. The only honest signal is what the viewer does
 *      next.
 *   2. There is no single "best" server. Reachability varies by country and by
 *      ISP — an audit from one machine found five of thirteen working, while
 *      three others resolved fine and were simply blocked on that network. A
 *      list curated from one place is wrong somewhere else.
 *
 * So instead of ranking servers once at build time, each device ranks its own
 * from what it has actually seen, and the order it tries them in improves with
 * use. A viewer who lands on a working server stops noticing there is a picker.
 *
 * The inference: if someone switches away from a server within a few seconds,
 * it did not play. If they stay past that, it did. Not perfect — somebody may
 * simply prefer another source — but wrong in a way that costs one position in
 * an ordering, and right often enough to float the working servers up.
 */

const KEY = 'sahrae.serverHealth.v1';

/** Below this, leaving is a verdict on the server. Above it, a preference. */
const GAVE_UP_MS = 12_000;

/** How much one recent result outweighs the accumulated history. */
const ALPHA = 0.3;

interface Health {
  /** Exponentially weighted success rate, 0..1. */
  score: number;
  plays: number;
  lastOk: number;
}

type Table = Record<string, Health>;

function read(): Table {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function write(t: Table): void {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* private mode */ }
}

/**
 * A server nobody has tried starts optimistic.
 *
 * Starting at zero would freeze the first working server in place forever and
 * never let anything else be tried — the classic cold-start trap in any
 * self-tuning ordering.
 */
const UNTRIED: Health = { score: 0.6, plays: 0, lastOk: 0 };

export function healthOf(id: string): Health {
  return read()[id] || { ...UNTRIED };
}

function record(id: string, ok: boolean): void {
  const t = read();
  const h = t[id] || { ...UNTRIED };
  t[id] = {
    score: h.score * (1 - ALPHA) + (ok ? 1 : 0) * ALPHA,
    plays: h.plays + 1,
    lastOk: ok ? Date.now() : h.lastOk,
  };
  write(t);
}

export function recordSuccess(id: string): void { record(id, true); }
export function recordFailure(id: string): void { record(id, false); }

/**
 * Turn "how long they stayed" into a verdict.
 *
 * Called when a viewer leaves a server — by switching, or by closing the
 * player. Anything under GAVE_UP_MS reads as "this did not play".
 */
export function recordDwell(id: string, ms: number): void {
  if (!id || ms <= 0) return;
  record(id, ms >= GAVE_UP_MS);
}

/**
 * Order servers best-first for THIS device.
 *
 * Sorted by measured score, with a recent success breaking ties — a server that
 * worked an hour ago is a better bet than one that worked last month, even at
 * the same rate. The original order breaks remaining ties, so a fresh install
 * gets the curated order until it has evidence of its own.
 */
export function rankServers<T extends { id: string }>(servers: T[]): T[] {
  const t = read();
  return servers
    .map((s, i) => ({ s, i, h: t[s.id] || UNTRIED }))
    .sort((a, b) => {
      if (Math.abs(b.h.score - a.h.score) > 0.05) return b.h.score - a.h.score;
      if (b.h.lastOk !== a.h.lastOk) return b.h.lastOk - a.h.lastOk;
      return a.i - b.i;
    })
    .map(({ s }) => s);
}

/** Everything this device has learned — for a diagnostics view. */
export function healthTable(): Table { return read(); }

/** Forget it all. For when a network changes and old verdicts are stale. */
export function resetHealth(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
