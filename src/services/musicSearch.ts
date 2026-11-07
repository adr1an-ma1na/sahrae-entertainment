/**
 * Sauti search, from the catalogue (Deezer) rather than YouTube uploads.
 *
 * YouTube search answered "diamond" with a re-upload of Rihanna's "Diamonds",
 * listed the same artist twice and called fans' playlists albums. The
 * catalogue knows songs, artists and releases as such; a song is matched to
 * its YouTube audio when it plays, as everywhere else in Sauti.
 *
 * The catalogue's own order is weak for short searches ("burna" puts an
 * artist with 44 fans above Burna Boy), so artists are ranked here: how well
 * the name matches, weighed against how many people follow them, with the
 * listener's own artists first. When the best artist is a clear match the top
 * result is the artist, and their songs and releases lead, as in Spotify.
 */
import { deezer, type DzAlbum } from './deezer';
import type { CArtist, CTrack } from './curate';
import { fold, rankArtists, artistLeads } from './searchRank.ts';

export interface SearchResult { songs: CTrack[]; artists: CArtist[]; albums: DzAlbum[]; topArtist: CArtist | null }

export async function searchCatalogue(query: string, own: ReadonlySet<string>, key: (name: string) => string): Promise<SearchResult> {
  const q = query.trim();
  const [tracks, found, albums] = await Promise.all([
    deezer.searchTracks(q, 25).catch(() => [] as CTrack[]),
    deezer.searchArtists(q, 40, true).catch(() => [] as CArtist[]),
    deezer.searchAlbums(q, 16).catch(() => [] as DzAlbum[]),
  ]);
  const artists = rankArtists(q, found, own, key).slice(0, 10);
  const lead = artistLeads(q, artists[0], own, key) ? artists[0] : null;
  if (!lead) return { songs: tracks.slice(0, 20), artists, albums, topArtist: null };

  // The search names an artist: their best songs and their releases first.
  const [top, theirs] = await Promise.all([
    deezer.topTracks(lead.id, 5).catch(() => [] as CTrack[]),
    deezer.artistAlbums(lead, 12).catch(() => [] as DzAlbum[]),
  ]);
  const songKeys = new Set<string>();
  const songs = [...top, ...tracks].filter((t) => { const k = fold(t.title) + '|' + t.artistId; if (songKeys.has(k)) return false; songKeys.add(k); return true; }).slice(0, 20);
  const albumIds = new Set<number>();
  const releases = [...theirs, ...albums].filter((r) => { if (albumIds.has(r.id)) return false; albumIds.add(r.id); return true; }).slice(0, 16);
  return { songs, artists, albums: releases, topArtist: lead };
}
