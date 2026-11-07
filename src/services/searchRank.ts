/**
 * Ranking for Sauti search (musicSearch.ts), kept free of the network so
 * search-check.mjs can test it directly.
 */
import type { CArtist } from './curate';

export const fold = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * How well an artist's name answers the search: 1.3 the name itself, 1.15 the
 * name starts with it, 1 it is one of the name's words, 0.6 it is inside the
 * name somewhere, 0.3 not at all (the catalogue matched it some other way).
 */
export function nameMatch(query: string, name: string): number {
  const q = fold(query), n = fold(name);
  if (!q || !n) return 0.3;
  if (n === q || n.replace(/ /g, '') === q.replace(/ /g, '')) return 1.3;
  if (n.startsWith(q + ' ') || n.startsWith(q)) return 1.15;
  if (` ${n} `.includes(` ${q} `)) return 1;
  if (n.includes(q)) return 0.6;
  return 0.3;
}

/** Name match weighed against following; the listener's own artists add 3. */
export function artistScore(query: string, a: CArtist, own: ReadonlySet<string>, key: (name: string) => string): number {
  return nameMatch(query, a.name) * Math.log10((a.fans ?? 0) + 10) + (own.has(key(a.name)) ? 3 : 0);
}

export function rankArtists(query: string, artists: CArtist[], own: ReadonlySet<string> = new Set(), key: (name: string) => string = fold): CArtist[] {
  const seen = new Set<string>();
  return artists
    .filter((a) => { const k = fold(a.name); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((a) => ({ a, s: artistScore(query, a, own, key) }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);
}

/**
 * The artist is the top result when the search names them: at least one of
 * their name's words, and a following (or the listener's own artist).
 */
export function artistLeads(query: string, a: CArtist | undefined, own: ReadonlySet<string> = new Set(), key: (name: string) => string = fold): boolean {
  if (!a) return false;
  return nameMatch(query, a.name) >= 1 && artistScore(query, a, own, key) >= 4.5;
}

