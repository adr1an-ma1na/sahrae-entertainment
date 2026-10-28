/**
 * Is this YouTube video a song?
 *
 * Music search asks YouTube for its Music category, but the uploader sets that
 * category, so chart compilations ("Top 40 Songs This Week"), reaction videos,
 * interviews, podcasts, news, trailers and "slowed + reverb" edits all arrive
 * labelled as music (owner, 2026-10-28: "avoid mixing YouTube videos that are
 * not music videos"). Everything that reaches Sauti from YouTube's search,
 * radio or charts passes through here (services/ytmusic.ts). Pure, so it is
 * testable alone (musicfilter-check.mjs). A listener's own imported playlists
 * are not filtered: what they chose stays.
 */

export interface SongLike { id?: string; title?: string; artist?: string; duration?: number }

// A song runs one to ten minutes; shorter is a clip or a Short, longer a mix or an album.
const MIN_S = 60;
const MAX_S = 600;

/** Videos that are about music, or several songs at once, rather than a song. */
const NOT_A_SONG = [
  // Several songs in one video.
  /\btop\s*\d{1,3}\b/i,
  /\b(songs|hits|tracks)\s+(of|this|from)\s+(the\s+)?(week|month|year|decade|\d{4})\b/i,
  /\b(best|greatest)\s+(songs|hits)\b/i,
  /\b(playlist|compilation|megamix|mega\s?mix|mashup|non-?stop|full\s+album|mixtape|dj\s+mix|mix\s+20\d\d|\d+\s*hours?|1\s*hour)\b/i,
  // Talk and video, not a song.
  /\b(reaction|reacts?\s+to|interview|podcast|episode|ep\.?\s*\d+|documentary|vlog|prank|challenge|tutorial|how\s+to|unboxing|review|highlights|full\s+movie|trailer|teaser|behind\s+the\s+scenes|gameplay|live\s*stream|press\s+conference|sermon|preaching|comedy\s+skit)\b/i,
  // Edits of a song rather than the song.
  /\b(8d\s*audio|slowed|sped\s*up|nightcore|bass\s*boosted|reverb)\b/i,
  /#shorts?\b/i,
];

/** Channels that post about music rather than make it. */
const NOT_AN_ARTIST = /\b(news|podcast|charts?|gaming|clips|highlights|reacts?|tv\s+news)\b/i;

export function isMusicTrack(t: SongLike | null | undefined): boolean {
  if (!t || !t.id) return false;
  if (t.duration && (t.duration < MIN_S || t.duration > MAX_S)) return false;
  const title = t.title || '';
  // Promotion, not a name: "#Artist #Uk #Album".
  if ((title.match(/#\w+/g) || []).length >= 2) return false;
  if (NOT_A_SONG.some((re) => re.test(title))) return false;
  if (NOT_AN_ARTIST.test(t.artist || '')) return false;
  return true;
}
