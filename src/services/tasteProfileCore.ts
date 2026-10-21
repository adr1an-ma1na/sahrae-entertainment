/**
 * One taste across everything Sahrae offers: what someone watches, what they
 * listen to, and the competitions they follow. Pure, so it is testable alone
 * (taste-check.mjs).
 *
 * No competitor spans films, music, radio and sport together, so this is
 * where being all of them pays: the home screen can open with the right film
 * genre, the right mix and the right league for this person.
 */

/** TMDB genre names, films and series together (ids shared where TMDB shares them). */
export const SCREEN_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science fiction', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & adventure', 10762: 'Kids', 10765: 'Sci-fi & fantasy', 10766: 'Soap', 10764: 'Reality', 10768: 'War & politics',
};

/** Taste fades: something watched three weeks ago counts half as much as today. */
export const HALF_LIFE_MS = 21 * 86_400_000;
const decay = (at: number, now: number) => 0.5 ** (Math.max(0, now - at) / HALF_LIFE_MS);

export type Watched = { timestamp: number; mediaType: 'movie' | 'tv'; item: { genre_ids?: number[]; genres?: { id: number }[] } };

export type ScreenTaste = { id: number; name: string; weight: number; type: 'movie' | 'tv' };

/**
 * Film and series genres, strongest first. Each title watched adds its
 * genres, weighted by how recently; genres picked at onboarding start with a
 * modest weight that real watching soon outweighs.
 */
export function screenTaste(watched: Watched[], picked: { id: number }[], now: number, n = 4): ScreenTaste[] {
  const w = new Map<number, { weight: number; movie: number; tv: number }>();
  const add = (id: number, by: number, type?: 'movie' | 'tv') => {
    if (!SCREEN_GENRES[id]) return;
    const e = w.get(id) || { weight: 0, movie: 0, tv: 0 };
    e.weight += by;
    if (type) e[type] += by;
    w.set(id, e);
  };
  for (const p of picked) add(p.id, 0.6);
  for (const x of watched) {
    const ids = x.item?.genre_ids || x.item?.genres?.map((g) => g.id) || [];
    const by = decay(x.timestamp, now);
    for (const id of ids.slice(0, 3)) add(id, by, x.mediaType);
  }
  return [...w.entries()]
    .sort((a, b) => b[1].weight - a[1].weight || a[0] - b[0])
    .slice(0, n)
    .map(([id, e]) => ({ id, name: SCREEN_GENRES[id], weight: Math.round(e.weight * 100) / 100, type: e.tv > e.movie ? 'tv' : 'movie' }));
}

/** Competitions followed, most first: each reminder set counts, keyed by its competition. */
export function followedCompetitions(reminderIds: string[], n = 2): string[] {
  const count = new Map<string, number>();
  for (const id of reminderIds) {
    const code = id.split(':')[0];
    if (code) count.set(code, (count.get(code) || 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([c]) => c);
}

export type Profile = { screen: ScreenTaste[]; music: { id: string; name: string }[]; sports: { code: string; name: string }[] };

/** The profile in a few words, for the home screen: "Crime · Drama · Afrobeats · Premier League". */
export function describe(p: Profile, max = 4): string {
  return [...p.screen.slice(0, 2).map((s) => s.name), ...p.music.slice(0, 1).map((m) => m.name), ...p.sports.slice(0, 1).map((s) => s.name)]
    .slice(0, max).join(' · ');
}
