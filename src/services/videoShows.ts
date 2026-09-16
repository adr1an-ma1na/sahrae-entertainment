import type { Track } from './ytmusic';

/**
 * Video podcasts — shows that publish full episodes on YouTube.
 *
 * HOW THIS LIST WAS BUILT, because it is the part most likely to be wrong.
 * Every channel id below was resolved and checked against the YouTube Data API
 * on 2026-09-13: it exists, it has a real audience, and it had published within
 * the previous month. Handles were NOT trusted from memory — that was tried
 * first and most guesses failed: Joe Rogan's and The Breakfast Club's handles do
 * not exist, every Kenyan and Nigerian handle guessed came back "not found", and
 * several that did resolve were impostors — "Flagrant Official" and "New Heights
 * Show" with ~0 subscribers, "Podcast & Chill" with no uploads at all. The real
 * Podcast and Chill is MacG's channel, found through a region-scoped search.
 *
 * The African shows came from channel searches scoped to Kenya, Nigeria and
 * South Africa, kept only with 50K+ subscribers, 30+ videos and a recent upload.
 * Live political news, church broadcasts and reaction channels were left out as
 * not podcasts. So were sexually explicit shows: this is a default shelf in a
 * family streaming app, and it should not lead with them.
 *
 * Channels go quiet. That is handled at runtime rather than by trusting this
 * list: a show with no long-form episode in its recent uploads simply does not
 * appear, instead of showing a stale card.
 */

export interface VideoShow {
  name: string;
  channelId: string;
  /** Where the show is from; 'GLOBAL' for international shows. */
  region: 'KE' | 'NG' | 'ZA' | 'GLOBAL';
}

export const VIDEO_SHOWS: VideoShow[] = [
  // Kenya
  { name: 'Iko Nini Podcast', channelId: 'UC5h4-WH0LAV4CWs380yM33A', region: 'KE' },
  { name: 'The 97s Podcast', channelId: 'UChQXn6sL9ENIpA74qqPG1HA', region: 'KE' },
  { name: 'Cleaning The Airwaves', channelId: 'UC9xBLAzNAgV9SfnJuXhGnOw', region: 'KE' },
  { name: 'The Joy Ride', channelId: 'UCCjULCQvh2cQQLzYe4DC2Nw', region: 'KE' },
  // Nigeria
  { name: 'ShxtsnGigs', channelId: 'UCzUjeR-Wgr0_iyL_brgx3Fw', region: 'NG' },
  { name: 'Isbae U', channelId: 'UCDe1cg0CZOtzmrTCVCaTKpw', region: 'NG' },
  { name: 'Glitch Africa', channelId: 'UCjzMxK80T1QVR7SbJ5iuC7Q', region: 'NG' },
  { name: 'The Clarity Zone', channelId: 'UCOmteima2A12BXBKtf_782g', region: 'NG' },
  // South Africa
  { name: 'Podcast and Chill with MacG', channelId: 'UC7BXdXFxVgMPKmBeDgx2QrQ', region: 'ZA' },
  { name: 'Open Chats Podcast', channelId: 'UCu5Ycs3Zn_9qkr57sg_BOiA', region: 'ZA' },
  { name: 'One54 Africa', channelId: 'UCbB_WVM-e7nuhWd_FB_8KBQ', region: 'ZA' },
  { name: 'Soweto Podcast', channelId: 'UCgSbC1mP30iJgeKPK9S3gmw', region: 'ZA' },
  // Global
  { name: 'The Diary Of A CEO', channelId: 'UCGq-a57w-aPwyi3pW7XLiHw', region: 'GLOBAL' },
  { name: 'Huberman Lab', channelId: 'UC2D2CMWXMOVWx7giW1n3LIg', region: 'GLOBAL' },
  { name: 'Lex Fridman Podcast', channelId: 'UCSHZKyawb77ixDdsGog4iWA', region: 'GLOBAL' },
  { name: 'Club Shay Shay', channelId: 'UCQoxJOkwaCgyzQtiuAIDcuw', region: 'GLOBAL' },
  { name: 'The High Performance Podcast', channelId: 'UCT4hFq01krOatjiSG7z3iag', region: 'GLOBAL' },
  { name: 'Hot Ones', channelId: 'UCPD_bxCRGpmmeQcbe2kpPaA', region: 'GLOBAL' },
];

/** Full episodes, not clips. Channels post Shorts and highlight cuts between episodes. */
export const MIN_EPISODE_SECONDS = 15 * 60;

export interface VideoEpisode { show: VideoShow; track: Track }

/**
 * Order shows for a listener: their region's first, then Africa, then global.
 * Pure, so it can be tested without the network.
 */
export function orderShows(shows: VideoShow[], region: string): VideoShow[] {
  const rank = (s: VideoShow) => (s.region === region ? 0 : s.region === 'GLOBAL' ? 2 : 1);
  return [...shows].sort((a, b) => rank(a) - rank(b));
}

/**
 * The newest full-length episode from each show's recent uploads.
 * A show with none — only clips lately, or gone quiet — is left out.
 */
export function pickEpisodes(shows: VideoShow[], uploads: Map<string, Track[]>): VideoEpisode[] {
  const out: VideoEpisode[] = [];
  for (const show of shows) {
    const list = (uploads.get(show.channelId) || [])
      .filter((t) => t.duration >= MIN_EPISODE_SECONDS && !/#shorts?\b/i.test(t.title))
      .sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0));
    const newest = list[0];
    if (!newest) continue;
    out.push({
      show,
      track: {
        ...newest,
        // The show, not the channel handle, is what a listener recognises.
        artist: show.name,
        isPodcast: true,
      },
    });
  }
  return out;
}
