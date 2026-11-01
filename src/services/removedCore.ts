/** The pure half of removed.ts, testable alone (legal-check.mjs). */
export interface Removed { movie: number[]; tv: number[] }

export const validRemoved = (x: unknown): x is Removed =>
  !!x && Array.isArray((x as Removed).movie) && Array.isArray((x as Removed).tv)
  && (x as Removed).movie.every((n) => Number.isInteger(n)) && (x as Removed).tv.every((n) => Number.isInteger(n));

/** Both lists together: a removal in either the shipped or the published copy counts. */
export function mergeRemoved(a: Removed, b?: Removed | null): Removed {
  if (!b) return a;
  return { movie: [...new Set([...a.movie, ...b.movie])], tv: [...new Set([...a.tv, ...b.tv])] };
}

export function isRemoved(list: Removed, type: 'movie' | 'tv', id: number): boolean {
  return (type === 'movie' ? list.movie : list.tv).includes(id);
}
