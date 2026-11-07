/**
 * Up next, the way Spotify's radio plays on from a song: the artist playing
 * and the artists the catalogue calls related, their real top songs woven
 * together (curate.buildMix, as the Daily Mixes are), each song once, no
 * remixes, live takes, sped-up edits or covers, and nothing already queued or
 * recently played in any version.
 *
 * The old source, YouTube's related videos, was checked by video id only, so
 * the same song came back as a lyric video, a remix or a cover (owner,
 * 2026-11-07). Songs here are catalogue songs (`dz:` ids), matched to their
 * YouTube audio as they come up, like every other Sauti mix.
 */
import { deezer } from './deezer';
import { buildMix, onePerSong, isVersion, songBase, type CArtist, type CTrack } from './curate';
import { artistNamed } from './sautiMixes';
import { leadArtist } from './taste';

/** Songs to follow `seed`, none whose songBase is in `avoid`. Empty when the catalogue cannot help. */
export async function upNext(seed: { artist: string; dz?: { artistId: number } }, avoid: ReadonlySet<string>, count = 25): Promise<CTrack[]> {
  const name = leadArtist(seed.artist);
  const artist: CArtist | null = seed.dz?.artistId
    ? { id: seed.dz.artistId, name }
    : await artistNamed(name).catch(() => null);
  if (!artist) return [];
  const related = (await deezer.related(artist.id, 12, true).catch(() => [] as CArtist[])).slice(0, 8);
  if (!related.length) return [];
  const [own, ...theirs] = await Promise.all(
    [artist, ...related].map((a) => deezer.topTracks(a.id, 10).catch(() => [] as CTrack[])),
  );
  const fresh = (list: CTrack[]) => onePerSong(list).filter((t) => !isVersion(t.title) && !avoid.has(songBase(t.title)));
  return onePerSong(buildMix([fresh(own)], theirs.map(fresh), count * 2)).slice(0, count);
}
