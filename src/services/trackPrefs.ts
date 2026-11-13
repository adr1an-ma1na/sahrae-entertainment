import { languageKey, languageLabel, type Choice } from './playerChoices.ts';

/**
 * The viewer's subtitle and audio language, and subtitle size, kept so the
 * next episode and the next film open the same way, as Netflix does
 * (owner, 2026-11-12). Carried between devices by the account sync
 * (syncKeys.SYNCED_KEYS).
 */
export type SubSize = 'S' | 'M' | 'L';
export interface TrackPrefs {
  /** Subtitle language ("english"); null = subtitles off. */
  subs: string | null;
  /** Audio language; null = whatever the server starts with. */
  audio: string | null;
  size: SubSize;
  /** The viewer has picked subtitles (or Off) at least once: from then on their pick rules. */
  subsChosen: boolean;
}

export const TRACK_PREFS_KEY = 'sahrae.tracks.v1';
const DEFAULTS: TrackPrefs = { subs: null, audio: null, size: 'M', subsChosen: false };

export function readTrackPrefs(store: Pick<Storage, 'getItem'> | null = safeStore()): TrackPrefs {
  try {
    const o = JSON.parse(store?.getItem(TRACK_PREFS_KEY) || 'null') as Partial<TrackPrefs> | null;
    if (!o || typeof o !== 'object') return { ...DEFAULTS };
    return {
      subs: typeof o.subs === 'string' && o.subs ? o.subs.slice(0, 40) : null,
      audio: typeof o.audio === 'string' && o.audio ? o.audio.slice(0, 40) : null,
      size: o.size === 'S' || o.size === 'L' ? o.size : 'M',
      subsChosen: o.subsChosen === true,
    };
  } catch { return { ...DEFAULTS }; }
}

export function saveTrackPrefs(change: Partial<TrackPrefs>, store: Pick<Storage, 'getItem' | 'setItem'> | null = safeStore()): TrackPrefs {
  const next = { ...readTrackPrefs(store), ...change };
  try { store?.setItem(TRACK_PREFS_KEY, JSON.stringify(next)); } catch { /* kept for this viewing only */ }
  return next;
}

function safeStore(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The track in `list` in language `want`, preferring a plain one over SDH/forced. */
export function trackFor(list: Choice[], want: string | null): number | null {
  if (!want) return null;
  const same = list.filter((c) => languageKey(c.label) === want);
  if (!same.length) return null;
  const plain = same.find((c) => !/\b(sdh|cc|forced|signs?)\b/i.test(c.label));
  return (plain || same[0]).id;
}

/**
 * Subtitle size as CSS, the same for Sahrae's player and a server's
 * (frame-options.js). Relative to the size the player already picks for its
 * picture, so a small player in the page and a full TV screen both read right.
 */
export const CUE_SIZE: Record<SubSize, string> = { S: '80%', M: '100%', L: '140%' };

/** Size subtitles drawn by Sahrae's own player. */
export function applyCueStyle(size: SubSize): void {
  try {
    let el = document.getElementById('sahrae-cues-top');
    if (!el) { el = document.createElement('style'); el.id = 'sahrae-cues-top'; document.head.appendChild(el); }
    el.textContent = `video::cue{font-size:${CUE_SIZE[size]}}`;
  } catch { /* no document */ }
}

/**
 * The subtitles a stream should open with. The viewer's own pick wins; until
 * they have made one, a title in another language (anime in Japanese, a Korean
 * drama) opens with English subtitles, unless it is already playing in English
 * (owner, 2026-11-13: "when in Japanese no English subtitles").
 */
export function subsWanted(p: TrackPrefs, original?: string | null, audioNow?: string | null): string | null {
  if (p.subs) return p.subs;
  if (p.subsChosen) return null;
  if (!original || original === 'en' || original === 'xx') return null;
  if (audioNow === 'english') return null;
  return 'english';
}

const CODES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'sv', 'no', 'da', 'fi', 'pl', 'ru', 'tr', 'ar', 'he', 'hi', 'sw', 'ja', 'ko', 'zh', 'th', 'vi', 'id', 'ms', 'tl'];
/** "english" -> "en", for servers that take a subtitle language in the address. */
export function langCode(key: string | null): string | null {
  if (!key) return null;
  return CODES.find((c) => languageLabel(c).toLowerCase() === key) || null;
}

/**
 * Servers that open with a subtitle language named in the address (VidFast's
 * `sub`), so the website gets it too, where Sahrae cannot reach into the player.
 */
export const SUB_PARAM_SERVERS: Record<string, string> = { vidfast: 'sub' };
export function withSubs(url: string, serverId: string, code: string | null): string {
  const key = SUB_PARAM_SERVERS[serverId];
  if (!key || !code || !/^[a-z]{2}$/.test(code)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(key, code);
    return u.toString();
  } catch { return url; }
}
