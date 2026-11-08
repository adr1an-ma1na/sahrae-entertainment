import type { ProofRow } from './playProofRank';

/**
 * Which stream sites hold up through a whole match, learned from everyone who
 * watches. Viewers complained of feeds dying midway (owner, 2026-11-08), and a
 * site's listing says nothing about that: a page that opens can still drop out
 * at half time. So a feed that keeps playing counts for its site, one that
 * stops counts against it, and the next match starts on the sites that last.
 *
 * Same shared table as films (play_proof). report_play only accepts film-shaped
 * keys and plain names, so sports sit under one film number no real title has
 * (TMDB ids are in the low millions), and needs no change to the database.
 */
export const FEED_PROOF_KEY = 'movie:999999999';

/** A site's name as report_play accepts it: letters and digits, 20 at most. */
export const feedServerId = (host: string) => host.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

/** Reports needed before a site is moved at all: a few bad nights prove nothing. */
const MIN_REPORTS = 5;

/** Higher plays first: 1 proven to last, -1 proven to drop, 0 not known. */
export function feedStanding(row: ProofRow | undefined): number {
  if (!row || row.ok_count + row.fail_count < MIN_REPORTS) return 0;
  if (row.fail_count > row.ok_count) return -1;
  return row.ok_count >= row.fail_count * 2 ? 1 : 0;
}

/** Proven sites first, proven droppers last, the schedule's own order otherwise. */
export function orderByProof<T>(feeds: T[], hostOf: (f: T) => string, rows: ProofRow[]): T[] {
  const by = new Map(rows.map((r) => [r.server_id, r]));
  return feeds
    .map((f, i) => ({ f, i, s: feedStanding(by.get(feedServerId(hostOf(f)))) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.f);
}

/** The next feed once every one has been tried: whichever failed longest ago. */
export function longestSinceFailing<T extends { id: string; lastFailure?: { at: number } }>(feeds: T[], currentId: string): T | null {
  const others = feeds.filter((f) => f.id !== currentId);
  if (!others.length) return null;
  return others.reduce((best, f) => ((f.lastFailure?.at ?? 0) < (best.lastFailure?.at ?? 0) ? f : best));
}
