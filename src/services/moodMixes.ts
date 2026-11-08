/**
 * The mood chips on the Music page (Energize, Relax, Focus, Workout, Feel
 * Good), from playlists Deezer's editors keep up to date, African ones first.
 *
 * They used to search YouTube for words like "gym motivation workout", which
 * spends the shared search allowance and answers nothing once it is gone: the
 * chips said "refreshing" and never filled (owner, 2026-11-08). Songs here are
 * catalogue songs, matched to their audio as they come up, like every mix.
 */
import { deezer } from './deezer';
import { blendMood, type CTrack } from './curate';

const MOODS: Record<string, { playlists: number[]; search: string }> = {
  // Afro Party, Party Hits, 20s Party Hits, Amapiano Finest
  Energize: { playlists: [1970037542, 2097558104, 13693477641, 5964916564], search: 'party hits' },
  // Afro Chill, Chill Vibes, Chill Hits, Chill R&B
  Relax: { playlists: [7437750224, 1925105902, 1976454162, 3196481502], search: 'chill' },
  // Focus, study lofi, chill lofi, Calm Piano
  Focus: { playlists: [8749343942, 8749345882, 3338949242, 4590807924], search: 'focus' },
  // Afrobeats Workout, Workout, Pop Workout, Running Hits
  Workout: { playlists: [6091186264, 2153050122, 2532117644, 1358731495], search: 'workout' },
  // Feel Good Afro, Feel Good Pop, good vibes, Feel Good Soul
  'Feel Good': { playlists: [10567515462, 1964085082, 2268939442, 4485213484], search: 'feel good' },
};

/** Too few to call a mix: a playlist has gone, so the editors' current ones are looked up. */
const ENOUGH = 20;

const tracksOf = (ids: number[]) => Promise.all(ids.map((id) => deezer.playlistTracks(id).catch(() => [] as CTrack[])));

/** Today's songs for a mood. The order changes daily and holds through the day. */
export async function moodSongs(mood: string, rng: () => number): Promise<CTrack[]> {
  const m = MOODS[mood];
  if (!m) return [];
  let lists = await tracksOf(m.playlists);
  if (lists.flat().length < ENOUGH) {
    const found = await deezer.searchPlaylists(m.search).catch(() => []);
    lists = [...lists, ...await tracksOf(found.slice(0, 3).map((p) => p.id))];
  }
  return blendMood(lists, rng);
}
