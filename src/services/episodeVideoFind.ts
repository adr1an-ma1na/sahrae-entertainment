/**
 * The YouTube video of a podcast episode being listened to, when the show
 * posts one (owner, 2026-11-19: "certain podcasts post also on YouTube for the
 * video … Diary of a CEO, I know there's more, let's ensure this works").
 *
 * Only ever the show's own upload of that same episode, never a clip, a
 * re-upload or another show: episodeVideo.matchEpisodeVideo decides, and it
 * would rather find nothing than the wrong video.
 *
 * Where it looks, cheapest first:
 *  1. a show known to post on YouTube (videoShows: the Video podcasts shelf and
 *     MATCH_SHOWS): its latest 50 uploads, a 2-unit look-up shared by every
 *     listener for a day, then, for an older episode, more of its uploads
 *     through Piped (free);
 *  2. any other show: a free video search through Piped for the show and title.
 * The official 100-unit search is never spent here. Answers are kept on the
 * device: a found video for good, "none" for three days.
 */
import { ytmusic, type Track } from './ytmusic';
import { ytDataApi } from './ytDataApi';
import { channelForShow } from './videoShows';
import { matchEpisodeVideo } from './episodeVideo';

const KEY = 'sahrae.podcast.video.v1';
const MISS_MS = 3 * 86_400_000;
const MAX = 400;
type Kept = Record<string, { v: Pick<Track, 'id' | 'duration' | 'uploaded'> | null; at: number }>;

const read = (): Kept => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Kept; } catch { return {}; } };
function keep(id: string, v: Track | null): void {
  const all = read();
  all[id] = { v: v ? { id: v.id, duration: v.duration, uploaded: v.uploaded } : null, at: Date.now() };
  const ids = Object.keys(all);
  if (ids.length > MAX) ids.sort((a, b) => all[a].at - all[b].at).slice(0, ids.length - MAX).forEach((k) => delete all[k]);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* not kept */ }
}

/** What is already known: the video, `null` for "none lately", undefined if never looked. */
export function knownEpisodeVideo(episodeId: string): Pick<Track, 'id' | 'duration' | 'uploaded'> | null | undefined {
  const hit = read()[episodeId];
  if (!hit) return undefined;
  if (hit.v) return hit.v;
  return Date.now() - hit.at < MISS_MS ? null : undefined;
}

/** Whether this is a podcast episode file that could have a video (not a book chapter, not already a video). */
export const couldHaveVideo = (t: Track | null | undefined, source = ''): t is Track =>
  !!t && !!t.audioUrl && !t.id.startsWith('ab:') && !source.startsWith('Audiobook:');

const inflight = new Map<string, Promise<Track | null>>();

/** The episode's video on YouTube, or null. */
export function findEpisodeVideo(ep: Track): Promise<Track | null> {
  const known = knownEpisodeVideo(ep.id);
  if (known !== undefined) return Promise.resolve(known ? { ...ep, ...known, audioUrl: undefined } as Track : null);
  if (inflight.has(ep.id)) return inflight.get(ep.id)!;
  const job = (async (): Promise<Track | null> => {
    const channel = channelForShow(ep.artist);
    if (channel) {
      const fromChannel = (list: Track[]) => matchEpisodeVideo(ep, list.filter((t) => !t.channelId || t.channelId === channel), { sameChannel: true });
      const uploads = (await ytDataApi.latestUploads([channel], 50).catch(() => null))?.get(channel) || [];
      let hit = fromChannel(uploads);
      // An older episode: further back through the channel, free.
      if (!hit) {
        const oldest = uploads.reduce((m, t) => (t.uploaded && t.uploaded < m ? t.uploaded : m), Infinity);
        if (!uploads.length || !ep.uploaded || ep.uploaded < oldest) {
          let page = await ytmusic.channelVideos(channel).catch(() => ({ items: [] as Track[], nextpage: null }));
          for (let i = 0; i < 4 && !hit; i++) {
            hit = fromChannel(page.items.map((t) => ({ ...t, channelId: channel })));
            const last = page.items[page.items.length - 1];
            if (hit || !page.nextpage || (last?.uploaded && ep.uploaded && last.uploaded < ep.uploaded - 7 * 86_400_000)) break;
            page = await ytmusic.channelMore(channel, page.nextpage).catch(() => ({ items: [] as Track[], nextpage: null }));
          }
        }
      }
      if (hit) return hit.track;
    }
    const q = `${ep.artist} ${ep.title}`.replace(/\s+/g, ' ').trim().slice(0, 110);
    const found = await ytmusic.searchVideosFree(q);
    return matchEpisodeVideo(ep, found)?.track || null;
  })()
    .then((v) => { keep(ep.id, v); return v ? ({ ...ep, ...v, title: ep.title, artist: ep.artist, audioUrl: undefined } as Track) : null; })
    .catch(() => null)
    .finally(() => inflight.delete(ep.id));
  inflight.set(ep.id, job);
  return job;
}

// ── Listen ⇄ Watch: the same episode, from the file or from its video ──
// The player swaps the queue's item and starts the other at the same second.
// What each swap came from is remembered, so Listen goes back to the very file.
const audioOf = new Map<string, Track>();

/** The episode as its video: the episode's own details, the video's id and length. */
export function asVideoEpisode(ep: Track, video: Track): Track {
  audioOf.set(video.id, ep);
  return {
    ...ep,
    id: video.id,
    duration: video.duration || ep.duration,
    audioUrl: undefined, audioUrlAlt: undefined, scStream: undefined,
    isPodcast: true,
  };
}

/** The file a video episode was swapped from, if it was. */
export const audioEpisodeFor = (videoId: string): Track | undefined => audioOf.get(videoId);
