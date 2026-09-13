/**
 * Turns YouTube's video metadata into song metadata.
 *
 * Music here is YouTube videos, and a video's title is written for YouTube
 * search, not for a music app:
 *
 *   "Rema - TEA (Official Music Video)"        by "RemaVEVO"
 *   "T.I. - LET &#39;EM KNOW (Official Video)"  by "TIVEVO"
 *
 * The song is "TEA" by "Rema". Shown raw, every row repeats the artist, carries
 * a label nobody asked for, and — worst — the Data API returns titles
 * HTML-escaped, so apostrophes appeared on screen as `&#39;`. That last one is a
 * plain bug, visible on the Music home.
 *
 * Deliberately conservative. Splitting "Artist - Title" is only done when the
 * left side genuinely names the channel's artist, because plenty of real song
 * titles contain " - " and plenty of channels are labels rather than artists;
 * guessing wrong would put a song title in the artist slot, which is worse than
 * leaving a long title alone. Meaningful parentheticals — (feat. X), (Remix),
 * (Live), (Acoustic), a translated title — are kept; only presentation labels
 * ("Official Video", "Lyrics", "4K") are removed.
 */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/** Decode the HTML entities the YouTube Data API puts in titles. */
export function decodeEntities(s: string): string {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);
}

/**
 * Presentation labels only. Each must be a phrase that never carries meaning
 * about WHICH recording this is — "Remix", "Live" and "Acoustic" do, so they
 * are absent on purpose.
 */
const LABEL = String.raw`(?:official\s+)?(?:music\s+video|lyric(?:s)?\s+video|video\s+oficial|official\s+video|official\s+audio|audio\s+oficial|visuali[sz]er|lyrics?|audio|video|clip\s+officiel|mv|m\/v|hd|hq|4k|8k|uhd)`;
const LABEL_ANYWHERE = new RegExp(String.raw`\b${LABEL}\b`, 'gi');

/**
 * A trailing label, optionally followed by a short production tag containing a
 * digit — "Ee Bwana Official Video MM7". The tag must contain a digit so a real
 * final word is never eaten along with the label.
 */
const TRAILING_LABEL = new RegExp(String.raw`\s*(?:[-–|/]\s*)?${LABEL}(?:\s+(?=[A-Za-z]*\d)[A-Za-z0-9]{1,5})?\s*$`, 'i');

/**
 * Remove labels from INSIDE brackets while keeping whatever else was in there.
 * "( Official video ft Fanta )" becomes "(ft Fanta)" — dropping the whole
 * bracket would throw the featured artist away along with the label.
 */
function stripBracketLabels(title: string): string {
  return title.replace(/\s*([\(\[])([^\)\]]*)([\)\]])/g, (whole, open: string, inner: string, close: string) => {
    if (!new RegExp(LABEL_ANYWHERE.source, 'i').test(inner)) return whole;
    const rest = inner
      .replace(LABEL_ANYWHERE, ' ')
      .replace(/^[\s\-–|/,.]+|[\s\-–|/,.]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return rest ? ` ${open}${rest}${close}` : '';
  });
}

/** "RemaVEVO" → "Rema", "Burna Boy - Topic" → "Burna Boy". */
export function cleanArtist(raw: string): string {
  const s = decodeEntities(raw)
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    // "Burna Boy Official" and "LISAOfficial" alike — channel handles often
    // glue the word straight onto the name.
    .replace(/\s*Official$/i, '')
    .trim();
  return s || 'Unknown Artist';
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Clean a title against its artist. Returns the (possibly corrected) artist too,
 * because splitting "Diamond Platnumz ft Jux - JOY" moves the featured artist
 * out of the title and into the artist line, where it belongs.
 */
export function cleanTrackText(rawTitle: string, rawArtist: string): { title: string; artist: string } {
  let artist = cleanArtist(rawArtist);
  let title = decodeEntities(rawTitle).replace(/\s+/g, ' ').trim();

  // Promotional tails that are never part of a song's name:
  //  - Skiza ringback-tune codes, common across East African uploads:
  //    "FUNGA MKANDA (Official Video). SMS SKIZA 69815"
  //  - SEO padding in pipe-separated segments:
  //    "My Game - Ravinder Grewal | New Punjabi Songs 2026 | Latest Punjabi Songs 2026"
  //    A segment is dropped only if it reads as padding (new/latest/top/best
  //    songs, a year, "official"), so "Song | Artist" style titles survive.
  title = title
    .replace(/\s*[.,\-–|]*\s*(?:dial|sms)?\s*\*?\s*skiza(?:\s+tune)?(?:\s+code)?\s*[:#]?\s*[\d*#\s]+.*$/i, '')
    .split(/\s+\|\s+/)
    .filter((seg, i) => i === 0 || !/\b(?:new|latest|top|best|hit|trending)\b.*\b(?:songs?|music|hits?|video)\b|\b20\d\d\b|\bofficial\b/i.test(seg))
    .join(' | ')
    .trim();

  // Strip presentation labels, repeatedly: "Song (Official Video) [4K]".
  for (let i = 0; i < 3; i++) {
    const before = title;
    title = stripBracketLabels(title).replace(TRAILING_LABEL, '').trim();
    if (title === before) break;
  }

  // "Artist - Title": split only when the left part names this channel's artist.
  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) {
    const left = m[1].trim();
    const right = m[2].trim();
    const a = norm(artist);
    if (a && a !== 'unknownartist' && norm(left).includes(a) && right.length > 0) {
      title = right;
      // Keep featured artists the left side added ("Diamond Platnumz ft Jux").
      if (norm(left) !== a) artist = left;
      // Same artist, better spelling: the channel "TIVEVO" cleans to "TI", but
      // the title writes "T.I.". Punctuation is information a channel handle
      // strips out, so the longer form wins. Equal length keeps the channel's
      // casing, so an all-caps "REMA - TEA" does not override "Rema".
      else if (left.length > artist.length) artist = left;
    }
  }

  // Tidy leftovers a removal can leave behind: trailing separators, empty ().
  title = title.replace(/\s*[\(\[]\s*[\)\]]/g, '').replace(/\s*[-–|/]+\s*$/, '').trim();
  return { title: title || decodeEntities(rawTitle).trim() || 'Unknown', artist };
}
