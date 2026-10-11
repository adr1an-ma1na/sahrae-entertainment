import { ytDataApi } from './ytDataApi';
import { ytmusic, type Track, type Artist } from './ytmusic';
import {
  GENRES, genreById, isSong, emptyIndex, indexPool, genresOf, addTaste, topGenres, TASTE_KEY,
  buildDailyMixes, recordServed, buildReleaseRadar, radarWeek, rankArtists, dayKey, STARTER_GENRES,
  type GenreTaste, type ServedHistory, type DailyMix,
} from './musicCatalog';

/**
 * The side of the catalogue that talks to YouTube and to this device's
 * storage. The rules live in musicCatalog.ts (pure, tested); this file loads
 * the genre playlists, remembers what the listener plays, and keeps each day's
 * Daily Mixes and each week's Release Radar fixed once built.
 */

const index = emptyIndex();
const pools = new Map<string, Track[]>();
const loading = new Map<string, Promise<Track[]>>();
const deepened = new Set<string>();

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full: rebuilt next time */ } };

/** Only what a mix needs to show and play a song (keeps storage small). */
const compact = (t: Track): Track => ({
  id: t.id, title: t.title, artist: t.artist, duration: t.duration,
  artwork: t.artwork, artworkLarge: t.artworkLarge, dominantColor: t.dominantColor,
  channelId: t.channelId, uploaded: t.uploaded,
});

/** A genre's songs: its verified playlists, read once and shared through the cache. */
export function genrePool(id: string): Promise<Track[]> {
  const have = pools.get(id);
  if (have) return Promise.resolve(have);
  const busy = loading.get(id);
  if (busy) return busy;
  const g = genreById(id);
  if (!g) return Promise.resolve([]);
  const p = (async () => {
    const lists = await Promise.all(g.playlists.map(async (pl) => {
      try {
        const official = await ytDataApi.playlistTracks(pl, 200, { local: false });
        return official ?? await ytmusic.playlistTracks(pl);
      } catch { return [] as Track[]; }
    }));
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const list of lists) for (const t of list || []) if (isSong(t) && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
    indexPool(index, id, out);
    if (out.length) pools.set(id, out);
    attributePending();
    return out;
  })().finally(() => loading.delete(id));
  loading.set(id, p);
  return p;
}

/**
 * Deepen a genre with its artists' newest uploads (about 25 units, shared for
 * six hours), so Daily Mixes can go a month without repeating and Release
 * Radar sees releases the playlists have not picked up yet.
 */
async function deepen(id: string): Promise<void> {
  if (deepened.has(id)) return;
  deepened.add(id);
  const base = await genrePool(id);
  const channels = rankArtists(base, 20).map((a) => a.id).filter((c) => /^UC[\w-]{22}$/.test(c));
  if (!channels.length) return;
  const byChannel = await ytDataApi.latestUploads(channels, 8).catch(() => null);
  if (!byChannel) return;
  const names = new Set(base.map((t) => (t.artist || '').toLowerCase()));
  const extra = [...byChannel.values()].flat()
    // A label channel uploads many artists: keep only this genre's artists.
    .filter((t) => isSong(t) && names.has((t.artist || '').toLowerCase()));
  const have = new Set(base.map((t) => t.id));
  const add = extra.filter((t) => !have.has(t.id));
  indexPool(index, id, add);
  pools.set(id, [...base, ...add]);
}

// ── Taste ──────────────────────────────────────────────────────────────────

let pending: Track[] = [];

function saveTaste(t: GenreTaste) { write(TASTE_KEY, t); }
export function readTaste(): GenreTaste { return read<GenreTaste>(TASTE_KEY, {}); }

/** Count a play toward its genres. Songs the catalogue has not loaded yet wait. */
export function notePlayed(t: Track): void {
  if (!t || t.isPodcast || t.audioUrl) return;
  const gs = genresOf(t, index);
  if (!gs.length) { pending = [t, ...pending.filter((p) => p.id !== t.id)].slice(0, 50); return; }
  let taste = readTaste();
  const now = Date.now();
  for (const g of gs) taste = addTaste(taste, g.id, g.weight, now);
  saveTaste(taste);
}

function attributePending(): void {
  if (!pending.length) return;
  const still: Track[] = [];
  let taste = readTaste();
  const now = Date.now();
  for (const t of pending) {
    const gs = genresOf(t, index);
    if (!gs.length) { still.push(t); continue; }
    for (const g of gs) taste = addTaste(taste, g.id, g.weight, now);
  }
  pending = still;
  saveTaste(taste);
}

const LEARNED_KEY = 'sahrae.music.learned.v1';

/**
 * Count songs the listener chose without playing them yet (the artists picked
 * when they started, liked songs): each once, ever.
 */
export function learnFrom(tracks: Track[]): void {
  const learned = new Set(read<string[]>(LEARNED_KEY, []));
  const fresh = tracks.filter((t) => t && !learned.has(t.id) && !t.isPodcast && !t.audioUrl);
  if (!fresh.length) return;
  for (const t of fresh) { learned.add(t.id); notePlayed(t); }
  write(LEARNED_KEY, [...learned].slice(-800));
}

/** Opening a genre is a weaker signal than playing it. */
export function noteGenreOpened(id: string): void {
  saveTaste(addTaste(readTaste(), id, 0.5, Date.now()));
}

/** The listener's genres, strongest first (the region's sounds for someone new). */
export function myGenres(n = 6): string[] {
  return topGenres(readTaste(), n, Date.now());
}

/**
 * First visit with a history but no genre taste yet (this feature is new):
 * learn it from what they already played, using the starter genres' catalogue.
 */
async function bootstrapTaste(familiar: Track[]): Promise<void> {
  if (Object.keys(readTaste()).length || !familiar.length) return;
  await Promise.all(STARTER_GENRES.map(genrePool));
  let taste: GenreTaste = {};
  const now = Date.now();
  for (const t of familiar) for (const g of genresOf(t, index)) taste = addTaste(taste, g.id, g.weight, now);
  if (Object.keys(taste).length) saveTaste(taste);
}

// ── Daily Mixes ────────────────────────────────────────────────────────────

const DAILY_KEY = 'sahrae.music.dailyMixes.v1';
const SERVED_KEY = 'sahrae.music.dailyServed.v1';

/** Today's Daily Mixes: built once per day, then the same all day. */
export async function dailyMixes(familiar: Track[]): Promise<DailyMix[]> {
  const day = dayKey();
  await bootstrapTaste(familiar);
  learnFrom(familiar);
  // Pools first: songs waiting for their genre are counted once it loads.
  await Promise.all(myGenres(6).map(genrePool));
  const genres = myGenres(6);
  const sig = genres.join(',');
  const saved = read<{ day: number; sig?: string; mixes: DailyMix[] } | null>(DAILY_KEY, null);
  // Same day, same genres: the same mixes all day.
  if (saved && saved.day === day && saved.sig === sig && saved.mixes?.length) return saved.mixes;
  await Promise.all(genres.map(genrePool));
  await Promise.all(genres.map((g) => deepen(g).catch(() => {})));

  const history = read<ServedHistory>(SERVED_KEY, {});
  const mixes = buildDailyMixes({ genres, pools, familiar, index, history, day })
    .map((m) => ({ ...m, tracks: m.tracks.map(compact) }));
  if (!mixes.length) return []; // offline or nothing loaded: try again later, record nothing
  write(DAILY_KEY, { day, sig, mixes });
  write(SERVED_KEY, recordServed(history, day, mixes));
  return mixes;
}

// ── Release Radar ──────────────────────────────────────────────────────────

const RADAR_KEY = 'sahrae.music.radar.v1';

/** This week's Release Radar (turns over on Friday), up to 100 songs. */
export async function releaseRadar(familiar: Track[]): Promise<{ tracks: Track[]; genres: string[] }> {
  const week = radarWeek(Date.now());
  const genres = myGenres(5);
  const sig = genres.slice(0, 3).join(',');
  const saved = read<{ week: number; sig: string; genres: string[]; tracks: Track[] } | null>(RADAR_KEY, null);
  if (saved && saved.week === week && saved.sig === sig && saved.tracks?.length) return { tracks: saved.tracks, genres: saved.genres };

  await Promise.all(genres.map(genrePool));
  await Promise.all(genres.map((g) => deepen(g).catch(() => {})));
  const favouriteArtists = new Set(familiar.map((t) => (t.artist || '').toLowerCase()).filter(Boolean));
  const tracks = buildReleaseRadar({ genres, pools, uploads: [], index, favouriteArtists, now: Date.now() }).map(compact);
  if (tracks.length) write(RADAR_KEY, { week, sig, genres, tracks });
  return { tracks, genres };
}

// ── Genres and artists ─────────────────────────────────────────────────────

/** Artists in some genres, most present first, with their channel avatars. */
export async function artistsIn(genreIds: string[], limit: number): Promise<Artist[]> {
  const lists = await Promise.all(genreIds.map(genrePool));
  const artists = rankArtists(lists.flat(), limit);
  const thumbs = await ytDataApi.channelThumbs(artists.map((a) => a.id)).catch(() => new Map<string, string>());
  return artists.map((a) => ({ ...a, thumbnail: thumbs.get(a.id) }));
}

export interface GenrePage { popular: Track[]; fresh: Track[]; artists: Artist[]; total: number }

/** Everything a genre page shows, from the genre's own catalogue (no searches). */
export async function genrePage(id: string): Promise<GenrePage> {
  noteGenreOpened(id);
  const pool = await genrePool(id);
  const now = Date.now();
  const popular = [...pool].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 80);
  const fresh = pool.filter((t) => t.uploaded && now - t.uploaded <= 28 * 86_400_000)
    .sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0)).slice(0, 60);
  const artists = await artistsIn([id], 80);
  return { popular, fresh, artists, total: pool.length };
}

/** Songs by one artist that the catalogue already holds (free). */
export function catalogueSongsBy(name: string): Track[] {
  const k = (name || '').toLowerCase();
  const out: Track[] = [];
  const seen = new Set<string>();
  for (const list of pools.values()) for (const t of list) if ((t.artist || '').toLowerCase() === k && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
  return out;
}

export { GENRES, genreById };
