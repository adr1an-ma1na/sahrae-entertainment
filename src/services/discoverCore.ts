/**
 * Discovery by time and mood, and the local rows, as TMDB discover queries.
 * Pure, so it is testable alone (discover-check.mjs).
 *
 * "I have 40 minutes, something light" is a question endless rows of posters
 * do not answer. Under an hour the answer is an episode, so it searches series
 * by episode length; longer, it searches films by running time.
 */

export type Mood = 'light' | 'thrilling' | 'feelgood' | 'mindbending' | 'scary' | 'romantic' | 'family';
export type TimeSlot = 30 | 60 | 95 | 130 | 999;

export const MOODS: { id: Mood; label: string; movie: string; tv: string }[] = [
  // TMDB genre ids. "|" is OR. TV has no horror or romance genre, so the
  // closest TV genres stand in (mystery and crime, drama).
  { id: 'light', label: 'Light & funny', movie: '35', tv: '35' },
  { id: 'thrilling', label: 'Thrilling', movie: '53|28', tv: '80|10759' },
  { id: 'feelgood', label: 'Feel-good', movie: '10751|10749|35', tv: '35|10751' },
  { id: 'mindbending', label: 'Mind-bending', movie: '878|9648', tv: '10765|9648' },
  { id: 'scary', label: 'Scary', movie: '27', tv: '9648|80' },
  { id: 'romantic', label: 'Romantic', movie: '10749', tv: '18' },
  { id: 'family', label: 'Family', movie: '10751|16', tv: '10751|16|10762' },
];

export const TIMES: { id: TimeSlot; label: string }[] = [
  { id: 30, label: '30 min' },
  { id: 60, label: '1 hour' },
  { id: 95, label: '1½ hours' },
  { id: 130, label: '2 hours' },
  { id: 999, label: 'All night' },
];

/** The discover query for a time and mood: which list to search, and its parameters. */
export function quickPickQuery(time: TimeSlot, mood: Mood): { type: 'movie' | 'tv'; params: Record<string, string> } {
  const m = MOODS.find((x) => x.id === mood) || MOODS[0];
  // Good, known titles only: a short list of strong options beats a long
  // list of obscure ones when someone just wants to press play.
  const quality = { 'vote_count.gte': '200', 'vote_average.gte': '6.5', sort_by: 'popularity.desc', include_adult: 'false' };
  if (time <= 60) {
    return { type: 'tv', params: { ...quality, with_genres: m.tv, 'with_runtime.lte': String(time), 'with_runtime.gte': String(Math.max(10, time - 35)) } };
  }
  if (time === 999) {
    return { type: 'movie', params: { ...quality, with_genres: m.movie, 'with_runtime.gte': '130' } };
  }
  return { type: 'movie', params: { ...quality, with_genres: m.movie, 'with_runtime.lte': String(time), 'with_runtime.gte': String(time - 35) } };
}

/** What a pick fits into, in words: "an episode under 30 min", "under 1½ hours". */
export function fitsLabel(time: TimeSlot): string {
  if (time <= 60) return `Episodes under ${time === 60 ? 'an hour' : `${time} min`}`;
  if (time === 999) return 'Long films for a long night';
  return `Films under ${TIMES.find((t) => t.id === time)?.label}`;
}

/** Local rows: Kenyan films and series, and stories from across Africa. */
export const LOCAL_ROWS = {
  kenya: { origin: 'KE' },
  // South Africa is left out on purpose: its results are led by Hollywood
  // co-productions shot there, which is not what "African stories" means.
  africa: { origin: 'NG|GH|KE|TZ|UG|RW|ET' },
};

export function localQuery(origin: string, type: 'movie' | 'tv'): Record<string, string> {
  return { with_origin_country: origin, sort_by: 'popularity.desc', include_adult: 'false', ...(type === 'movie' ? { 'vote_count.gte': '3' } : {}) };
}

/**
 * Sauti's "right now" mix: the day and the hour name the moment, and the moment
 * picks the music. A weekday evening winds down; a Friday or Saturday night
 * warms up; Sunday morning is gospel. Pure, so the same hour always gives the
 * same mix and it can be tested.
 */
export interface Moment { id: string; title: string; blurb: string; queries: string[] }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Several narrow searches, merged: one broad search returns mostly hour-long DJ
// mixes, which the song filter rightly drops, leaving a mix of two songs.
export function momentFor(d: Date, year = d.getFullYear()): Moment {
  const day = DAYS[d.getDay()];
  const h = d.getHours();
  const weekend = d.getDay() === 5 || d.getDay() === 6;
  const m = (id: string, title: string, blurb: string, queries: string[]): Moment => ({ id, title, blurb, queries });
  if (d.getDay() === 0 && h >= 5 && h < 13) return m('sunday-gospel', 'Sunday morning praise', 'Gospel and worship to start the day.', [`gospel songs ${year}`, 'worship songs', 'kenyan gospel songs']);
  if (h >= 5 && h < 9) return m('early', `Ease into ${day}`, 'Soft acoustic, soul and calm afro for the first hour.', ['acoustic soul songs', 'calm afro soul songs', 'morning acoustic pop songs']);
  if (h >= 9 && h < 12) return m('morning', `${day} morning lift`, 'Bright, upbeat songs to get going.', [`feel good pop songs ${year}`, `afrobeats songs ${year}`, 'upbeat happy songs']);
  if (h >= 12 && h < 17) return m('afternoon', `${day} afternoon groove`, 'Afrobeats, amapiano and bongo to carry the afternoon.', [`afrobeats songs ${year}`, `amapiano songs ${year}`, 'bongo flava songs']);
  if (h >= 17 && h < 21) return weekend
    ? m('warmup', `${day} night warm-up`, 'Dance, afrobeats and amapiano to start the night.', [`dance songs ${year}`, `amapiano songs ${year}`, `afrobeats party songs ${year}`])
    : m('unwind', `${day} evening, unwind`, 'R&B, soul and slow grooves after the day.', [`rnb songs ${year}`, 'neo soul songs', 'afro rnb songs']);
  return m('late', `Late-night ${day}`, 'Slow jams and low lights.', ['slow jams rnb songs', 'late night rnb songs', 'quiet storm soul songs']);
}
