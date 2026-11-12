import { languageKey, type Choice } from './playerChoices.ts';

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
}

export const TRACK_PREFS_KEY = 'sahrae.tracks.v1';
const DEFAULTS: TrackPrefs = { subs: null, audio: null, size: 'M' };

export function readTrackPrefs(store: Pick<Storage, 'getItem'> | null = safeStore()): TrackPrefs {
  try {
    const o = JSON.parse(store?.getItem(TRACK_PREFS_KEY) || 'null') as Partial<TrackPrefs> | null;
    if (!o || typeof o !== 'object') return { ...DEFAULTS };
    return {
      subs: typeof o.subs === 'string' && o.subs ? o.subs.slice(0, 40) : null,
      audio: typeof o.audio === 'string' && o.audio ? o.audio.slice(0, 40) : null,
      size: o.size === 'S' || o.size === 'L' ? o.size : 'M',
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
