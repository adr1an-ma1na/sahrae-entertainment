/**
 * Loader for the video podcasts shelf. The curated list and the pure selection
 * logic live in videoShows.ts, so they can be tested without the network or the
 * API client.
 */
import { ytDataApi } from './ytDataApi';
import { VIDEO_SHOWS, orderShows, pickEpisodes, type VideoEpisode } from './videoShows.ts';

export { VIDEO_SHOWS, MIN_EPISODE_SECONDS, orderShows, pickEpisodes } from './videoShows.ts';
export type { VideoShow, VideoEpisode } from './videoShows.ts';

export async function loadVideoPodcasts(region: string): Promise<VideoEpisode[]> {
  const ordered = orderShows(VIDEO_SHOWS, region);
  const uploads = await ytDataApi.latestUploads(ordered.map((s) => s.channelId), 6);
  if (!uploads) return [];
  return pickEpisodes(ordered, uploads);
}
