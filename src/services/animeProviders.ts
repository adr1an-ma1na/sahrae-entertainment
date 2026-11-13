/**
 * Is a title anime? Used to ask AniSkip for Skip Intro timings
 * (services/skipSegments.ts) when TheIntroDB has none.
 *
 * By TMDB's own classification: Animation, and either TMDB's "anime" keyword
 * or a Japanese production in Japanese. Not every animated film (Soul,
 * Arcane, Avatar: The Last Airbender are not), not every Japanese production
 * (live action has no Animation genre).
 */

/** TMDB's "anime" keyword (search/keyword?query=anime, 2026-11-13). */
export const ANIME_KEYWORD = 210024;
const ANIMATION = 16;

export interface AnimeMeta {
  genres?: { id: number }[];
  original_language?: string;
  origin_country?: string[];
  keywords?: { results?: { id: number }[]; keywords?: { id: number }[] };
}

export function isAnime(d: AnimeMeta | null | undefined): boolean {
  if (!d || !d.genres?.some((g) => g.id === ANIMATION)) return false;
  const kw = d.keywords?.results || d.keywords?.keywords || [];
  if (kw.some((k) => k.id === ANIME_KEYWORD)) return true;
  return d.original_language === 'ja' && !!d.origin_country?.includes('JP');
}
