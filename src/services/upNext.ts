/**
 * Up next, as Spotify's radio plays on from a song (stationCore.ts says how it
 * decides): Deezer's radio for the artist, its closest neighbours' radios,
 * their best known songs and a few of the artist's own, scored for this
 * listener and ordered to flow. Each song once, no remixes, live takes,
 * sped-up edits or covers, nothing already queued or just played.
 *
 * Songs are catalogue songs (`dz:` ids), matched to their YouTube audio as
 * they come up, like every other Sauti mix. The old source, YouTube's related
 * videos, brought the same song back as a lyric video, a remix or a cover
 * (owner, 2026-11-07).
 */
import { deezer } from './deezer';
import type { CArtist, CTrack } from './curate';
import { artistNamed, loadPicks } from './sautiMixes';
import { leadArtist, loadTaste, weigh } from './taste';
import { leadOnly, rankStation, type Source } from './stationCore';

export interface StationContext {
  /** Artists of the listener's liked songs. */
  liked?: string[];
  /** Quick skips this session, per artistKey. */
  sessionSkips?: Map<string, number>;
  /** Songs not to offer (songBase). */
  avoid?: ReadonlySet<string>;
  /** Artists heard just before (stationCore). */
  justHeard?: number[];
}

/** The listener, as the station sees them: their artists' weights, their skips, who is out. */
function listener(ctx: StationContext) {
  const log = loadTaste();
  const picks = loadPicks()?.artists.map((a) => a.name) || [];
  const taste = new Map(weigh({ picks, liked: ctx.liked || [], log }).map((w) => [w.key, w.w] as const));
  const skips = new Map<string, number>();
  for (const [k, s] of Object.entries(log.a)) if (s.skips > 0.5) skips.set(k, s.skips / 2);
  for (const [k, n] of ctx.sessionSkips || []) skips.set(k, (skips.get(k) || 0) + n);
  return { taste, skips, banned: new Set(log.banned) };
}

/** A station from an artist: `count` songs, best first. Empty when the catalogue cannot help. */
export async function artistStation(artist: CArtist, count: number, ctx: StationContext = {}): Promise<CTrack[]> {
  const related = (await deezer.related(artist.id, 12, true).catch(() => [] as CArtist[])).slice(0, 8);
  const none = Promise.resolve([] as CTrack[]);
  const [radio, own, nearA, nearB, ...relTops] = await Promise.all([
    deezer.artistRadio(artist.id, 40).catch(() => [] as CTrack[]),
    deezer.topTracks(artist.id, 12).catch(() => [] as CTrack[]),
    related[0] ? deezer.artistRadio(related[0].id, 25).catch(() => [] as CTrack[]) : none,
    related[1] ? deezer.artistRadio(related[1].id, 25).catch(() => [] as CTrack[]) : none,
    ...related.slice(0, 6).map((r) => deezer.topTracks(r.id, 6).catch(() => [] as CTrack[])),
  ]);
  if (!radio.length && !relTops.some((l) => l.length)) return [];
  const sources: { source: Source; tracks: CTrack[] }[] = [
    { source: 'radio', tracks: radio },
    { source: 'own', tracks: leadOnly(own, artist.id) },
    { source: 'near', tracks: nearA },
    { source: 'near', tracks: nearB },
    ...relTops.map((list, i) => ({ source: 'related' as Source, tracks: leadOnly(list, related[i].id) })),
  ];
  return rankStation({ seedArtistId: artist.id, sources, ...listener(ctx), avoid: new Set(ctx.avoid || []), justHeard: ctx.justHeard, count });
}

/** Songs to follow `seed`, none whose songBase is in `avoid`. Empty when the catalogue cannot help. */
export async function upNext(
  seed: { artist: string; dz?: { artistId: number } },
  avoid: ReadonlySet<string>,
  count = 25,
  ctx: StationContext = {},
): Promise<CTrack[]> {
  const name = leadArtist(seed.artist);
  const artist: CArtist | null = seed.dz?.artistId
    ? { id: seed.dz.artistId, name }
    : await artistNamed(name).catch(() => null);
  if (!artist) return [];
  // The song it plays on from was by this artist: someone else next, as Spotify's radio does.
  return artistStation(artist, count, { ...ctx, avoid, justHeard: [artist.id] });
}

