import type { Track, Artist } from './ytmusic.ts';
import { seededShuffle, spaceArtists, dayKey } from './mixes.ts';

/**
 * The Sauti catalogue: genres, the artists in them, and the mixes built from
 * what someone actually listens to — the way Spotify does it, within what
 * YouTube allows.
 *
 * WHY PLAYLISTS, NOT SEARCH. The YouTube Data API gives the whole project
 * 10,000 units a day. A search costs 100 (about 95 a day for EVERY listener
 * combined); reading a playlist costs 1 unit per 50 songs. Opening a mood page
 * used to spend 500 units and an artist 200, which is why the catalogue felt
 * small. Here each genre is a set of verified, actively maintained playlists
 * (several updated daily), read once and shared through the cache, so the
 * catalogue is thousands of songs and hundreds of artists for a few units.
 *
 * Everything that decides WHAT goes into a mix is a pure function below, so
 * the rules (genre taste, no repeats across days, the 100-song radar) are
 * tested directly in musiccatalog-check.mjs.
 */

export interface Genre {
  id: string;
  name: string;
  /** Card colour for the genre tile. */
  tint: string;
  /** YouTube playlist ids, verified on 2026-10-11 (size and last update). */
  playlists: string[];
  /** Related genres, used only to round out a new listener's mixes. */
  near: string[];
}

export const GENRES: Genre[] = [
  { id: 'afrobeats', name: 'Afrobeats', tint: '#E8590C', near: ['amapiano', 'afro-house', 'dancehall'],
    playlists: ['PLg48S-qywklsWUghMABHirfcdKKlrnzD-', 'PLg48S-qywkluXnwtxDIfLxIs-724qujrz', 'PLL2lAlYzgEXtgGdyN6Qc5Sh4I8NnZejlj'] },
  { id: 'amapiano', name: 'Amapiano', tint: '#7048E8', near: ['afro-house', 'afrobeats', 'gospel'],
    playlists: ['PLg48S-qywklvuabkR4siHkrUCJmWVhql7', 'PLHHHFaJKXM-8tb_sGI5yaSeoOKLLqTTYo', 'PLaaVen57lEb-fUSkehlUB756VCzre6t4U'] },
  { id: 'bongo', name: 'Bongo Flava', tint: '#0CA678', near: ['kenyan', 'afrobeats', 'rhumba'],
    playlists: ['PLg48S-qywkluIKq4t46pbIc_Zex-SyWqV', 'PLSp_ltmWDveB4XGj58OkQ2urZqT1MNSUo', 'PLw-zWewu83khjjHtt0myPem4EuatN5CWN'] },
  { id: 'kenyan', name: 'Kenyan Hits', tint: '#C92A2A', near: ['bongo', 'afrobeats', 'drill'],
    playlists: ['PLcAelm11yfN1XrZqJR5-TxijiSX_6p--a', 'PLMmVJHHEJ42-3VfQJnfAHLeegkjbFtpM1', 'PLLKmO69CbTYjMvEvwi2BZuUXjqJNjhbKz'] },
  { id: 'afro-house', name: 'Afro House', tint: '#5F3DC4', near: ['amapiano', 'edm', 'afrobeats'],
    playlists: ['RDCLAK5uy_lakBT61ImX7CpKwUjDyQGGY-K7v1GSZwM', 'PLahYpfovQkqwnaoxS-1DNheekeGu3SIZv', 'PLHHHFaJKXM-_lbKzjTMQHA5HJqDTBbmlE'] },
  { id: 'hip-hop', name: 'Hip-Hop & Rap', tint: '#343A40', near: ['rnb', 'drill', 'pop'],
    playlists: ['PLDIoUOhQQPlXFSnCfj8HuVhOUSC0QwxYD', 'PL3-sRm8xAzY9Qd1BoHHYFXRMUQlB4BZNt', 'PL147KeAbZcBNVt1EPjwjVEdivocWEox2u'] },
  { id: 'rnb', name: 'R&B', tint: '#A61E4D', near: ['hip-hop', 'pop', 'soul-jazz'],
    playlists: ['PL3-sRm8xAzY_Rr7jgjrVCEy1JnNPuVp0W', 'PLHg022HMFzFB7nKvmuvpyGTDPCV7-A8ux', 'PLDIoUOhQQPlVFjmZnM41bOzoowjfTS4wU'] },
  { id: 'pop', name: 'Pop', tint: '#D6336C', near: ['rnb', 'edm', 'kpop'],
    playlists: ['PLcirGkCPmbmHk1eaOH0C9PBETFZjEPVNu', 'PLDIoUOhQQPlUDNpjEYTTE9tb-QvUHUSMt', 'PLos7xCCYivJ9Oq4pNK9-D1ESAwPkVeveh'] },
  { id: 'dancehall', name: 'Dancehall', tint: '#2B8A3E', near: ['reggae', 'afrobeats', 'latin'],
    playlists: ['PLTJt1Dync0cKQb_Y7IqJNxiCdnp9nkJtm', 'PLxxX7_lSMt4BKZ_CUXctDHIBf-zW9jrmH', 'PLF1Etgj18gSqdoSUSPdo4srVSI0AudNpv'] },
  { id: 'reggae', name: 'Reggae', tint: '#5C940D', near: ['dancehall', 'soul-jazz', 'rhumba'],
    playlists: ['PLxvodScTx2RsV2VIDIBksBmuLFngu3mgU', 'PLxvodScTx2RuFQ2yyEOS9lH5XcDvZwQgA', 'PLRH43FHT5_3gb3tc3NL9pOlnSQcfMGiVb'] },
  { id: 'gospel', name: 'Gospel', tint: '#1971C2', near: ['amapiano', 'soul-jazz', 'rnb'],
    playlists: ['PLmOk00V-7RN7HwoOBDFuTck475JamLc5Y', 'PLTmaZB7buLodqE2r3IWccdLHUqD1jaDX8', 'PLIVbZhwLbExKoDlYntZV_Y1c3bZYz7hAs'] },
  { id: 'edm', name: 'House & EDM', tint: '#1098AD', near: ['afro-house', 'pop', 'lo-fi'],
    playlists: ['PLRZlMhcYkA2GJCuab9iNizKn6tf7uPv6q', 'PLHACtR4F3SV_Eyc5844pIgneLrShsD8bb', 'PLjOp1EWfRMez45jaSnjZwI2P8BUwdZD1g'] },
  { id: 'latin', name: 'Latin & Reggaeton', tint: '#F08C00', near: ['dancehall', 'pop', 'afrobeats'],
    playlists: ['PLtN-ATFsIsaZm4KgdYEVnaIYgXxOE5Fwe', 'PLaynZzPSMtgqC4SOtNuniQVTSd-4PJC-q', 'PLCQHZp35U7j8LnhboYvdJyTYuWwmrIEip'] },
  { id: 'rock', name: 'Rock', tint: '#495057', near: ['pop', 'country', 'soul-jazz'],
    playlists: ['PLn4GvABOzCQursVQ7qMU9CkNaKz4RgrVM', 'PLGBuKfnErZlAdX8X5LC9ODeHaxoxTuV2z', 'PL0GvsLQil0MmYC96KEs_7dTNsLm1PS6JX'] },
  { id: 'kpop', name: 'K-Pop', tint: '#E64980', near: ['pop', 'edm', 'rnb'],
    playlists: ['PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17', 'PL7yCNn9IZ1CY-Od4SR39Bn4WY58VlygRU', 'PLKAiKOhU07BCUHtrEkl2FyqY8gKkYMgYf'] },
  { id: 'country', name: 'Country', tint: '#A0522D', near: ['rock', 'pop', 'gospel'],
    playlists: ['PL3oW2tjiIxvRDymF6SFf7t4xfDbtRQxlt', 'PL9V-Dt4XA4CN3jQK1LclKv0zJR6lhuHNe', 'PLLDVfSPfze0tOzlLGWe_WUd4VXeO7ATEZ'] },
  { id: 'soul-jazz', name: 'Soul & Jazz', tint: '#846358', near: ['rnb', 'lo-fi', 'gospel'],
    playlists: ['PLEz_mLoNZMeQ4vIDdwmTfbOqBbftHuYXP', 'PL8F6B0753B2CCA128', 'PLiy0XOfUv4hFHmPs0a8RqkDzfT-2nw7WV'] },
  { id: 'rhumba', name: 'Rhumba & Lingala', tint: '#E67700', near: ['bongo', 'afrobeats', 'soul-jazz'],
    playlists: ['PL8VlGKRpPRwIXC-tSwXJcmWHhANXQU5F0', 'PL8VlGKRpPRwI5ULe-qJEQv5m32gwhXXsA', 'PLg48S-qywklteibKVsdVfrThl1LjR03Gh'] },
  { id: 'drill', name: 'Drill', tint: '#212529', near: ['hip-hop', 'kenyan', 'afrobeats'],
    playlists: ['PLZ6afNou8CGsKvy4hKjikZlG5_nMDtw5O', 'PLgw6m1NndhB2AUBwUTFW1DQjvzty4xBT6', 'PLZ6afNou8CGsDMmBR_Gcxd9W-pOUzAs2d'] },
  { id: 'lo-fi', name: 'Lo-fi & Chill', tint: '#3B5BDB', near: ['soul-jazz', 'edm', 'rnb'],
    playlists: ['PL6fhs6TSspZv0F0YgsG-p7Mn189CU2XKS', 'PLXIclLvfETS3AgCnZg4N6QqHu_T27XKIq', 'PLBTanuC8SLeZUH4mYXFvRbDfxTMKvNLHJ'] },
];

export const genreById = (id: string): Genre | undefined => GENRES.find((g) => g.id === id);

/** What a brand-new listener starts from: the region's own sounds first. */
export const STARTER_GENRES = ['afrobeats', 'amapiano', 'kenyan', 'bongo', 'hip-hop', 'rnb'];

const norm = (s: string): string => (s || '').trim().toLowerCase();

/** A song, not a mix, a clip or a short. */
export function isSong(t: Track): boolean {
  if (!t || !t.id) return false;
  if (t.duration && (t.duration < 60 || t.duration > 600)) return false;
  const title = t.title || '';
  if (/#shorts?\b/i.test(title)) return false;
  // Channel vlogs and teasers: "#Artist #Uk #Album", "24hrs Harmonize in Nairobi".
  if ((title.match(/#\w+/g) || []).length >= 2) return false;
  if (/\b\d+\s*hrs?\b|\bvlog\b|behind the scenes|\btrailer\b|\bteaser\b|\binterview\b/i.test(title)) return false;
  if (/\b(full album|mixtape|non ?stop|nonstop|1 hour|\d+ hours?|mix 20\d\d|dj mix)\b/i.test(title)) return false;
  return true;
}

// ── Genre taste ────────────────────────────────────────────────────────────

export type GenreTaste = Record<string, { score: number; at: number }>;
export const TASTE_KEY = 'sahrae.music.genreTaste.v1';
/** Taste fades: what someone played three weeks ago counts half as much. */
const HALF_LIFE_MS = 21 * 86_400_000;

export function decayedScore(e: { score: number; at: number }, now: number): number {
  return e.score * 0.5 ** (Math.max(0, now - e.at) / HALF_LIFE_MS);
}

/** Add weight to a genre (pure: returns a new taste). */
export function addTaste(taste: GenreTaste, genreId: string, weight: number, now: number): GenreTaste {
  const prev = taste[genreId];
  const score = (prev ? decayedScore(prev, now) : 0) + weight;
  return { ...taste, [genreId]: { score, at: now } };
}

/** The listener's genres, strongest first; the region's sounds when there is no history yet. */
export function topGenres(taste: GenreTaste, n: number, now: number, fallback: string[] = STARTER_GENRES): string[] {
  const ranked = Object.entries(taste)
    .map(([id, e]) => [id, decayedScore(e, now)] as const)
    .filter(([id, s]) => s > 0.05 && genreById(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  if (ranked.length >= n) return ranked.slice(0, n);
  // Round out a thin history with the neighbours of what they do play, then the starters.
  const out = [...ranked];
  for (const id of ranked) for (const nb of genreById(id)?.near || []) if (out.length < n && !out.includes(nb)) out.push(nb);
  for (const id of fallback) if (out.length < n && !out.includes(id)) out.push(id);
  return out.slice(0, n);
}

/** Index of which genres each song and artist belong to, built from the pools. */
export interface GenreIndex {
  byTrack: Map<string, string>;
  /** artist key → genre → how many of their songs are in it */
  byArtist: Map<string, Map<string, number>>;
}

export function emptyIndex(): GenreIndex { return { byTrack: new Map(), byArtist: new Map() }; }

export function indexPool(index: GenreIndex, genreId: string, tracks: Track[]): void {
  for (const t of tracks) {
    if (!index.byTrack.has(t.id)) index.byTrack.set(t.id, genreId);
    const a = norm(t.artist);
    if (!a) continue;
    if (!index.byArtist.has(a)) index.byArtist.set(a, new Map());
    const m = index.byArtist.get(a)!;
    m.set(genreId, (m.get(genreId) || 0) + 1);
  }
}

/** Which genres a play counts toward: the song's own, else its artist's spread. */
export function genresOf(t: Track, index: GenreIndex): { id: string; weight: number }[] {
  const exact = index.byTrack.get(t.id);
  if (exact) return [{ id: exact, weight: 1 }];
  const m = index.byArtist.get(norm(t.artist));
  if (!m || !m.size) return [];
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()].map(([id, n]) => ({ id, weight: n / total }));
}

/** "DJ Maphorisa, DJ Tunez, Wizkid" or "Harmonize ft. Mbosso" → the first name. */
export function leadArtist(artist: string): string {
  return (artist || '').split(/\s*(?:,|&|\bx\b|\bft\.?|\bfeat\.?|\bfeaturing\b|\bwith\b)\s*/i)[0].trim();
}

// ── Daily Mixes ────────────────────────────────────────────────────────────

/** day number → ids served in that day's Daily Mixes. */
export type ServedHistory = Record<number, string[]>;
/** A song used in a Daily Mix is not used again for this long. */
export const NO_REPEAT_DAYS = 30;
export const DAILY_MIX_SIZE = 50;

export interface DailyMix { id: string; title: string; subtitle: string; genre: string; tracks: Track[] }

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Ids served within `days` days before `day` (today is never "served before"). */
export function servedWithin(history: ServedHistory, day: number, days: number): Set<string> {
  const out = new Set<string>();
  for (const [d, ids] of Object.entries(history)) {
    const n = Number(d);
    if (n < day && n >= day - days) for (const id of ids) out.add(id);
  }
  return out;
}

/**
 * Up to six Daily Mixes, one per genre the listener plays most.
 *
 * Each blends songs they already like in that genre (at most 30%) with the
 * genre's wider catalogue, artists spaced apart. No song from a previous day's
 * Daily Mixes returns for NO_REPEAT_DAYS; if a genre runs short before then, the
 * oldest are allowed back first, never yesterday's. Within a day no song is in
 * two mixes.
 */
export function buildDailyMixes(p: {
  genres: string[];
  pools: Map<string, Track[]>;
  familiar: Track[];
  index: GenreIndex;
  history: ServedHistory;
  day: number;
  size?: number;
  max?: number;
}): DailyMix[] {
  const size = p.size ?? DAILY_MIX_SIZE;
  const usedToday = new Set<string>();
  const mixes: DailyMix[] = [];

  for (const gid of p.genres.slice(0, p.max ?? 6)) {
    const genre = genreById(gid);
    const pool = (p.pools.get(gid) || []).filter(isSong);
    if (!genre || !pool.length) continue;
    const familiar = p.familiar.filter((t) => isSong(t) && genresOf(t, p.index).some((g) => g.id === gid && g.weight >= 0.5));

    // Widest no-repeat window the pool can satisfy, but never below one day.
    let window = NO_REPEAT_DAYS;
    let blocked = servedWithin(p.history, p.day, window);
    const available = () => [...pool, ...familiar].filter((t) => !blocked.has(t.id) && !usedToday.has(t.id)).length;
    while (window > 1 && available() < size) {
      window = Math.max(1, Math.floor(window / 2));
      blocked = servedWithin(p.history, p.day, window);
    }

    const seed = p.day ^ hashStr(gid);
    const ok = (t: Track) => !blocked.has(t.id) && !usedToday.has(t.id);
    const fam = seededShuffle(familiar.filter(ok), seed).slice(0, Math.floor(size * 0.3));
    const famIds = new Set(fam.map((t) => t.id));
    const fresh = seededShuffle(pool.filter((t) => ok(t) && !famIds.has(t.id)), seed + 1);

    // Interleave: roughly one familiar song in every three.
    const blend: Track[] = [];
    let fi = 0, ni = 0;
    while (blend.length < size && (fi < fam.length || ni < fresh.length)) {
      const takeFamiliar = fi < fam.length && (blend.length % 3 === 1 || ni >= fresh.length);
      blend.push(takeFamiliar ? fam[fi++] : fresh[ni++]);
    }
    const seenTitle = new Set<string>();
    const tracks = spaceArtists(blend.filter((t) => {
      const k = `${norm(t.artist)}|${norm(t.title)}`;
      if (seenTitle.has(k)) return false;
      seenTitle.add(k);
      return true;
    }), 3).slice(0, size);
    if (tracks.length < 12) continue;
    tracks.forEach((t) => usedToday.add(t.id));

    const names: string[] = [];
    for (const t of tracks) {
      const lead = leadArtist(t.artist);
      if (lead && !names.includes(lead)) names.push(lead);
      if (names.length === 3) break;
    }
    mixes.push({
      id: `daily-${p.day}-${gid}`,
      title: `Daily Mix ${mixes.length + 1}`,
      subtitle: `${genre.name} · ${names.join(', ')}`,
      genre: gid,
      tracks,
    });
  }
  return mixes;
}

/** Record today's mixes in the history and drop days older than the window. */
export function recordServed(history: ServedHistory, day: number, mixes: DailyMix[]): ServedHistory {
  const out: ServedHistory = {};
  for (const [d, ids] of Object.entries(history)) if (Number(d) >= day - NO_REPEAT_DAYS) out[Number(d)] = ids;
  // Add to the day, never replace it: if the mixes are rebuilt later the same
  // day (the listener's genres changed), the morning's songs still count.
  out[day] = [...new Set([...(history[day] || []), ...mixes.flatMap((m) => m.tracks.map((t) => t.id))])];
  return out;
}

// ── Release Radar ──────────────────────────────────────────────────────────

export const RADAR_MAX = 100;
const RADAR_AGE_MS = 28 * 86_400_000;

/** Spotify's radar refreshes on Fridays; this week number turns over on Friday. */
export function radarWeek(now: number): number {
  return Math.floor((now / 86_400_000 + 3) / 7); // day 0 (1970-01-01) was a Thursday
}

/**
 * Up to 100 new songs in the listener's genres: released in the last four
 * weeks, newest first, artists spaced, duplicates of the same song removed.
 * Artists the listener already plays come first within a week's releases.
 */
export function buildReleaseRadar(p: {
  genres: string[];
  pools: Map<string, Track[]>;
  uploads: Track[];
  index: GenreIndex;
  favouriteArtists: Set<string>;
  now: number;
  max?: number;
}): Track[] {
  const max = p.max ?? RADAR_MAX;
  const wanted = new Set(p.genres);
  const inGenres = (t: Track) => {
    const own = p.index.byTrack.get(t.id);
    if (own) return wanted.has(own);
    return genresOf(t, p.index).some((g) => wanted.has(g.id));
  };
  const cands = [
    ...p.genres.flatMap((g) => p.pools.get(g) || []),
    ...p.uploads.filter(inGenres),
  ].filter((t) => isSong(t) && t.uploaded && p.now - t.uploaded <= RADAR_AGE_MS && t.uploaded <= p.now + 86_400_000);

  const seen = new Set<string>();
  const unique = cands.filter((t) => {
    const k = `${norm(t.artist)}|${norm(t.title)}`;
    if (seen.has(t.id) || seen.has(k)) return false;
    seen.add(t.id); seen.add(k);
    return true;
  });
  const WEEK = 7 * 86_400_000;
  unique.sort((a, b) => {
    const wa = Math.floor((p.now - (a.uploaded || 0)) / WEEK), wb = Math.floor((p.now - (b.uploaded || 0)) / WEEK);
    if (wa !== wb) return wa - wb;
    const fa = p.favouriteArtists.has(norm(a.artist)) ? 1 : 0, fb = p.favouriteArtists.has(norm(b.artist)) ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return (b.uploaded || 0) - (a.uploaded || 0);
  });
  // Space artists within each week, so spacing never lets an older release
  // jump ahead of a newer one.
  const weeks = new Map<number, Track[]>();
  for (const t of unique) {
    const w = Math.floor((p.now - (t.uploaded || 0)) / WEEK);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w)!.push(t);
  }
  return [...weeks.keys()].sort((a, b) => a - b).flatMap((w) => spaceArtists(weeks.get(w)!, 2)).slice(0, max);
}

// ── Artists ────────────────────────────────────────────────────────────────

/**
 * The artists in some genres, most present first, one entry per artist name
 * with the channel that uploads most of their songs.
 */
export function rankArtists(tracks: Track[], limit: number): Artist[] {
  const by = new Map<string, { name: string; n: number; channels: Map<string, number>; thumb?: string }>();
  for (const t of tracks) {
    const k = norm(t.artist);
    if (!k || k.length < 2 || /various artists|unknown/i.test(k)) continue;
    const e = by.get(k) || { name: t.artist, n: 0, channels: new Map<string, number>() };
    e.n += 1;
    if (t.channelId) e.channels.set(t.channelId, (e.channels.get(t.channelId) || 0) + 1);
    by.set(k, e);
  }
  return [...by.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((e) => {
      const ch = [...e.channels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return { id: ch || `name:${e.name}`, name: e.name, thumbnail: undefined } as Artist;
    });
}

export { dayKey };
