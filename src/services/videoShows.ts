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

/**
 * More shows that post their full episodes on YouTube, used only to find the
 * video of an episode being listened to (the Now Playing Watch switch), not
 * to fill the Video podcasts shelf. Owner, 2026-11-19: "certain podcasts post
 * also on YouTube … Diary of a CEO, I know there's more". Each channel was
 * resolved from its @handle and checked on YouTube's own feed on 2026-11-19 to
 * be the show's real channel, posting that week; impostors and clip channels
 * found on the way (an old "New heights", "Impaulsive Show Clips", a dormant
 * "myfirstmillion") were left out. `match` is the show's name as podcast
 * catalogues write it, letters and digits only.
 */
export const MATCH_SHOWS: { match: string[]; channelId: string }[] = [
  { match: ['joeroganexperience'], channelId: 'UCzQUP1qoWDoEbmsQxvdjxgQ' },
  { match: ['modernwisdom'], channelId: 'UCIaH-gZIVC432YRjNVvnyCA' },
  { match: ['melrobbins'], channelId: 'UCk2U-Oqn7RXf-ydPqfSxG5g' },
  { match: ['thispastweekend', 'theovon'], channelId: 'UC5AQEUAwCh1sGDvkQtkDWUQ' },
  { match: ['shawnryanshow'], channelId: 'UCkoujZQZatbqy4KGcgjpVxQ' },
  { match: ['impaulsive'], channelId: 'UCGeBogGDZ9W3dsGx-mWQGJA' },
  { match: ['timferrissshow'], channelId: 'UCznv7Vf9nBdJYvBagFdAHWw' },
  { match: ['schoolofgreatness'], channelId: 'UCKsP3v2JeT2hWI_HzkxWiMA' },
  { match: ['armchairexpert'], channelId: 'UClKP53RewJWK5s5WtLSg7Dg' },
  { match: ['callherdaddy'], channelId: 'UCyGi3eCuxko37WB6uUr7LjA' },
  { match: ['dwarkesh'], channelId: 'UCXl4i9dYBrFOabk0xGmbkRA' },
  { match: ['peterattiadrive', 'thedrivewithpeterattia', 'peterattia'], channelId: 'UC8kGsMa0LygSX9nkBcBH1Sg' },
  { match: ['richrollpodcast'], channelId: 'UCpjlh0e319ksmoOD7bQFSiw' },
  { match: ['onpurposewithjayshetty', 'jayshetty'], channelId: 'UCbV60AGIHKz2xIGvbk0LLvg' },
  { match: ['profgpod', 'profgshow'], channelId: 'UC1E1SVcVyU3ntWMSQEp38Yw' },
  { match: ['allinwithchamath', 'allinpodcast'], channelId: 'UCESLZhusAkFfsNsApnjF_Cg' },
  { match: ['restispolitics'], channelId: 'UCsufaClk5if2RGqABb-09Uw' },
  { match: ['smartless'], channelId: 'UC-W8Qu2Zb407kjVhW-5U-SA' },
  { match: ['minimalistspodcast'], channelId: 'UCkbFiBwMYMXAqifXF4xo5Uw' },
  { match: ['startupideaspodcast'], channelId: 'UCPjNBjflYl0-HQtUvOx0Ibw' },
];

const letters = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '');

/** The YouTube channel a podcast show posts its episodes to, when it is one we know. */
export function channelForShow(showName: string): string | null {
  const n = letters(showName);
  if (!n) return null;
  const extra = MATCH_SHOWS.find((s) => s.match.some((m) => n.includes(m)));
  if (extra) return extra.channelId;
  const known = VIDEO_SHOWS.find((v) => { const a = letters(v.name); return a.length >= 5 && (n.includes(a) || (n.length >= 8 && a.includes(n))); });
  return known ? known.channelId : null;
}
