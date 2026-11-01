/**
 * Sauti's mixes, built the way Spotify builds them (curate.ts):
 *
 *   Daily Mixes   the listener's artists (picked at first run, plus the ones
 *                 they actually play), grouped by who is related to whom, each
 *                 group's songs woven with its related artists' songs
 *   Genre mixes   a genre's known artists and their neighbours, top songs only
 *
 * The listener's picks live in `sahrae.music.picks.v1` (carried between devices
 * by the account sync). Mixes are kept for the day, so opening Music again does
 * not rebuild them; they change as the picks and the listening change.
 */
import { deezer } from './deezer';
import { buildMix, clusterArtists, interleave, mixSubtitle, type CArtist, type CTrack } from './curate';
import { GENRES, type Genre } from './genres';

export interface Picks { artists: CArtist[]; genres: string[]; at: number }
export interface Mix { id: string; title: string; subtitle: string; cover?: string; tint?: string; tracks: CTrack[] }

export const PICKS_KEY = 'sahrae.music.picks.v1';
const MIXES_KEY = 'sahrae.music.dailyMixes.v2';
const GENRE_MIX_KEY = 'sahrae.music.genreMix.v1.';

export function loadPicks(): Picks | null {
  try {
    const p = JSON.parse(localStorage.getItem(PICKS_KEY) || 'null') as Picks | null;
    return p && Array.isArray(p.artists) ? { genres: [], ...p } : null;
  } catch { return null; }
}
export function savePicks(p: Omit<Picks, 'at'>): Picks {
  const full = { ...p, at: Date.now() };
  try { localStorage.setItem(PICKS_KEY, JSON.stringify(full)); } catch { /* storage full */ }
  return full;
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const today = () => new Date().toDateString();

/** The catalogue artist for a name, only when it really is that name (not a namesake's tribute act). */
export async function artistNamed(name: string): Promise<CArtist | null> {
  const found = await deezer.searchArtists(name, 5).catch(() => [] as CArtist[]);
  // Spacing aside ("Ali Kiba" is "Alikiba" there): the exact name first, then one that starts with it.
  const squash = (s: string) => fold(s).replace(/ /g, '');
  const want = squash(name);
  return found.find((a) => squash(a.name) === want)
    || found.find((a) => squash(a.name).startsWith(want) || want.startsWith(squash(a.name)))
    || null;
}

async function tops(artists: CArtist[], n: number): Promise<CTrack[][]> {
  return Promise.all(artists.map((a) => deezer.topTracks(a.id, n).catch(() => [] as CTrack[])));
}

/** Up to six Daily Mixes from these artists. `played` are artist names from listening, which grow the mixes. */
export async function dailyMixes(picks: CArtist[], played: string[] = []): Promise<Mix[]> {
  // The artists played most join the picks: the mixes follow what is actually listened to.
  const extra = (await Promise.all(played.slice(0, 6).map(artistNamed))).filter(Boolean) as CArtist[];
  const seen = new Set<number>();
  const artists = [...picks, ...extra].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))).slice(0, 18);
  if (!artists.length) return [];
  const sig = `${today()}|${artists.map((a) => a.id).join(',')}`;
  try {
    const kept = JSON.parse(localStorage.getItem(MIXES_KEY) || 'null') as { sig: string; mixes: Mix[] } | null;
    if (kept?.sig === sig && kept.mixes.length) return kept.mixes;
  } catch { /* none kept */ }

  const relatedOf = Object.fromEntries(await Promise.all(artists.map(async (a) => [a.id, await deezer.related(a.id, 10).catch(() => [] as CArtist[])] as const)));
  const groups = clusterArtists(artists, Object.fromEntries(Object.entries(relatedOf).map(([id, rs]) => [Number(id), rs.map((r) => r.id)])));
  const mixes: Mix[] = [];
  for (const group of groups) {
    const mine = new Set(artists.map((a) => a.id));
    const neighbours: CArtist[] = [];
    for (const a of group) for (const r of relatedOf[a.id] || []) if (!mine.has(r.id) && !neighbours.some((x) => x.id === r.id)) neighbours.push(r);
    const [familiar, discovery] = await Promise.all([tops(group, 12), tops(neighbours.slice(0, 8), 6)]);
    const tracks = buildMix(familiar, discovery, 50);
    if (tracks.length < 12) continue;
    mixes.push({ id: `daily-${mixes.length + 1}`, title: `Daily Mix ${mixes.length + 1}`, subtitle: mixSubtitle(tracks), cover: group[0].picture, tracks });
  }
  try { localStorage.setItem(MIXES_KEY, JSON.stringify({ sig, mixes })); } catch { /* storage full */ }
  return mixes;
}

/** A genre's mix: its artists and their neighbours, top songs, about 50. */
export async function genreMix(genre: Genre, size = 50): Promise<Mix | null> {
  const key = GENRE_MIX_KEY + genre.id;
  try {
    const kept = JSON.parse(localStorage.getItem(key) || 'null') as { day: string; mix: Mix } | null;
    if (kept?.day === today() && kept.mix.tracks.length) return kept.mix;
  } catch { /* none kept */ }

  let artists: CArtist[] = [];
  if (genre.seeds?.length) artists = (await Promise.all(genre.seeds.slice(0, 8).map(artistNamed))).filter(Boolean) as CArtist[];
  if (artists.length < 4 && genre.dz) artists = [...artists, ...(await deezer.genreArtists(genre.dz).catch(() => [] as CArtist[])).slice(0, 10)];
  if (artists.length < 4) {
    // Last resort: the artists that recur across the genre's most complete playlists.
    const lists = (await deezer.searchPlaylists(genre.q || genre.name, 6).catch(() => [])).filter((p) => p.tracks >= 20).slice(0, 2);
    const songs = (await Promise.all(lists.map((p) => deezer.playlistTracks(p.id, 80).catch(() => [] as CTrack[])))).flat();
    const count = new Map<number, { a: CArtist; n: number }>();
    for (const t of songs) count.set(t.artistId, { a: { id: t.artistId, name: t.artist }, n: (count.get(t.artistId)?.n || 0) + 1 });
    artists = [...artists, ...[...count.values()].filter((x) => x.n >= 2).sort((x, y) => y.n - x.n).slice(0, 10).map((x) => x.a)];
  }
  if (!artists.length) return null;
  // Widen through the first few artists' neighbours, as a radio of the genre would.
  const neighbours = (await Promise.all(artists.slice(0, 3).map((a) => deezer.related(a.id, 6).catch(() => [] as CArtist[])))).flat()
    .filter((r, i, all) => !artists.some((a) => a.id === r.id) && all.findIndex((x) => x.id === r.id) === i).slice(0, 6);
  const lists = await tops([...artists, ...neighbours], 8);
  const tracks = interleave(lists, size, 3);
  if (tracks.length < 10) return null;
  const mix: Mix = { id: `genre-${genre.id}`, title: genre.name, subtitle: mixSubtitle(tracks), cover: artists[0].picture, tint: genre.tint, tracks };
  try { localStorage.setItem(key, JSON.stringify({ day: today(), mix })); } catch { /* storage full */ }
  return mix;
}

/** The genres the listener picked, as mixes (the first `n`). */
export async function pickedGenreMixes(ids: string[], n = 4): Promise<Mix[]> {
  const genres = ids.map((id) => GENRES.find((x) => x.id === id)).filter(Boolean).slice(0, n) as Genre[];
  return (await Promise.all(genres.map((x) => genreMix(x).catch(() => null)))).filter(Boolean) as Mix[];
}
