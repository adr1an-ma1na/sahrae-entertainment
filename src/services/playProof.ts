import { supabase } from '../supabase';

/**
 * Which server played this exact film or episode for other viewers.
 *
 * serverHealth remembers what worked on this device. That cannot know that
 * VidRock has Wednesday S2E1 while VidSrc.to does not: hosts carry different
 * titles, and they gain and drop them without notice. So each viewer who gets
 * a title playing reports the server, and the next viewer of that title starts
 * on it. A server several viewers saw fail for a title, with no success since,
 * is skipped for that title. The list checks itself as hosts change.
 *
 * Shared through Supabase (table play_proof, function report_play; SQL in
 * cloudSync.ts). Everything here degrades to "no crowd data": a missing table,
 * no network or a slow answer simply leaves serverHealth in charge.
 */

export { NO_CROWD, GOOD_FOR_MS, BADGE_FOR_MS, crowdChoice, nextServerRanked, titleKey, type ProofRow, type CrowdChoice } from './playProofRank';
import { BADGE_FOR_MS, type ProofRow } from './playProofRank';

const READ_TIMEOUT_MS = 2500;
const CACHE_MS = 2 * 60 * 1000;

const cache = new Map<string, { at: number; rows: ProofRow[] }>();

function withTimeout<T>(p: PromiseLike<T>, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(p).catch(() => fallback),
    new Promise<T>((r) => setTimeout(() => r(fallback), READ_TIMEOUT_MS)),
  ]);
}

/** The crowd's rows for one title. Never throws; [] when unknown. */
export async function fetchProof(key: string): Promise<ProofRow[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  if (!supabase) return [];
  const rows = await withTimeout(
    supabase.from('play_proof').select('server_id, ok_count, fail_count, last_ok, last_fail').eq('title_key', key)
      .then(({ data, error }) => (error || !data ? [] : (data as ProofRow[]))),
    [] as ProofRow[],
  );
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

/** Episode numbers of a season that played for someone in the last two days. */
export async function fetchSeasonPlayable(id: number, season: number): Promise<Set<number>> {
  if (!supabase) return new Set();
  const since = new Date(Date.now() - BADGE_FOR_MS).toISOString();
  const prefix = `tv:${id}:${season}:`;
  const rows = await withTimeout(
    supabase.from('play_proof').select('title_key').like('title_key', `${prefix}%`).gte('last_ok', since)
      .then(({ data, error }) => (error || !data ? [] : (data as { title_key: string }[]))),
    [] as { title_key: string }[],
  );
  return new Set(rows.map((r) => Number(r.title_key.slice(prefix.length))).filter((n) => Number.isFinite(n)));
}

const sent = new Set<string>();

/** Tell the next viewer. Fire and forget, once per title, server and outcome per session. */
export function reportPlay(key: string, server: string, ok: boolean): void {
  const k = `${key}|${server}|${ok}`;
  if (sent.has(k) || !supabase) return;
  sent.add(k);
  cache.delete(key);
  void supabase.rpc('report_play', { p_title: key, p_server: server, p_ok: ok })
    .then(undefined, () => { /* table not created yet, or offline: the crowd just misses one report */ });
}

/** Open the connection to a server's host ahead of a likely switch, so it answers faster. */
export function warmUp(url: string): void {
  try {
    const origin = new URL(url).origin;
    if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = origin;
    document.head.appendChild(l);
  } catch { /* a bad URL just goes unwarmed */ }
}
