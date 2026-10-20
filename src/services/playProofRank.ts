/**
 * The pure half of playProof: what the crowd's reports say about each server
 * for one title, and where to go next. No imports, so it is testable alone
 * (playproof-check.mjs).
 */

export type ProofRow = {
  server_id: string;
  ok_count: number;
  fail_count: number;
  last_ok: string | null;
  last_fail: string | null;
};

export type CrowdChoice = {
  /** Index of the server that most recently played this title for someone, or null. */
  best: number | null;
  /** Servers that played this title for someone recently. */
  good: Set<string>;
  /** Servers several viewers saw fail on this title, with no success since. */
  bad: Set<string>;
};

/** How long a success counts. Hosts drop titles, so old proof is no proof. */
export const GOOD_FOR_MS = 14 * 24 * 60 * 60 * 1000;
/** "Plays" badges on episodes only claim what was seen in the last two days. */
export const BADGE_FOR_MS = 48 * 60 * 60 * 1000;
/** Failures needed before a server is skipped for a title. One could be the viewer's network. */
const FAILS_TO_SKIP = 2;

export const NO_CROWD: CrowdChoice = { best: null, good: new Set(), bad: new Set() };

export function titleKey(type: string, id: number, season: number, episode: number): string {
  return type === 'movie' ? `movie:${id}` : `tv:${id}:${season}:${episode}`;
}

const t = (s: string | null) => (s ? Date.parse(s) || 0 : 0);

/** Pure: what the crowd's rows say about each server, in the order of `ids`. */
export function crowdChoice(ids: string[], rows: ProofRow[], now = Date.now()): CrowdChoice {
  const good = new Set<string>();
  const bad = new Set<string>();
  let best: number | null = null;
  let bestAt = 0;
  for (const r of rows) {
    const i = ids.indexOf(r.server_id);
    if (i < 0) continue;
    const ok = t(r.last_ok), failAt = t(r.last_fail);
    const recentOk = ok > 0 && now - ok < GOOD_FOR_MS;
    if (recentOk && (ok >= failAt || r.ok_count >= r.fail_count)) {
      good.add(r.server_id);
      if (ok > bestAt || (ok === bestAt && best !== null && i < best)) { best = i; bestAt = ok; }
    } else if (r.fail_count >= FAILS_TO_SKIP && failAt > 0 && now - failAt < GOOD_FOR_MS) {
      bad.add(r.server_id);
    }
  }
  return { best, good, bad };
}

/**
 * Pure: the server to fall back to. Servers proven on this title come first,
 * most recent first; then the usual order without the ones the crowd saw fail;
 * then, rather than give up, those too.
 */
export function nextServerRanked(ids: string[], from: number, failed: ReadonlySet<string>, choice: CrowdChoice, rows: ProofRow[] = []): number | null {
  const okAt = new Map(rows.map((r) => [r.server_id, t(r.last_ok)]));
  const proven = ids
    .map((id, i) => ({ id, i }))
    .filter(({ id, i }) => i !== from && choice.good.has(id) && !failed.has(id))
    .sort((a, b) => (okAt.get(b.id) || 0) - (okAt.get(a.id) || 0));
  if (proven.length) return proven[0].i;
  const skipBad = nextOutside(ids, from, new Set([...failed, ...choice.bad]));
  if (skipBad !== null) return skipBad;
  return nextOutside(ids, from, failed);
}


/** The next server after `from` not in `skip`, wrapping; null when none is left. */
function nextOutside(ids: string[], from: number, skip: ReadonlySet<string>): number | null {
  for (let k = 1; k < ids.length; k++) {
    const i = (from + k) % ids.length;
    if (!skip.has(ids[i])) return i;
  }
  return null;
}
