/**
 * Quality and sound for whatever is playing: Sahrae's own player, or a server's
 * player reached through the helper in its frame (assets/frame-options.js).
 * On a TV the server's own settings are out of the remote's reach (owner,
 * 2026-11-08). Each server offers what it offers; a list of one is no choice.
 */
export interface Choice { id: number; label: string }

export interface PlayerChoices {
  quality: Choice[];
  qualityOn: number;
  audio: Choice[];
  audioOn: number;
  /** Subtitles the stream carries; `subsOn` -1 is Off. */
  subs: Choice[];
  subsOn: number;
  pickQuality: (id: number) => void;
  pickAudio: (id: number) => void;
  /** -1 turns subtitles off. */
  pickSubs: (id: number) => void;
}

export type ChoiceLists = Pick<PlayerChoices, 'quality' | 'qualityOn' | 'audio' | 'audioOn' | 'subs' | 'subsOn'>;

interface RawLevel { id?: unknown; label?: unknown; height?: unknown }

const MAX = 16;
const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 24) : '');
const AUTO = /^auto\b/i;

/** Sharpest first, Auto ahead of them, one entry per height. */
export function qualityList(levels: RawLevel[]): Choice[] {
  const seen = new Set<string>();
  const rows = levels.flatMap((l) => {
    if (typeof l?.id !== 'number') return [];
    const height = typeof l.height === 'number' && l.height > 0 ? Math.round(l.height) : 0;
    const given = text(l.label);
    const auto = AUTO.test(given);
    const label = auto ? 'Auto' : height ? `${height}p` : given;
    if (!label || seen.has(label)) return [];
    seen.add(label);
    return [{ id: l.id, label, height, auto }];
  });
  rows.sort((a, b) => Number(b.auto) - Number(a.auto) || b.height - a.height);
  return rows.slice(0, MAX).map(({ id, label }) => ({ id, label }));
}

export function audioList(tracks: RawLevel[], none = 'Sound'): Choice[] {
  return tracks.flatMap((t, i) => {
    if (typeof t?.id !== 'number' || t.id < 0) return [];
    return [{ id: t.id, label: languageLabel(text(t.label)) || `${none} ${i + 1}` }];
  }).slice(0, MAX);
}

export const subsList = (tracks: RawLevel[]): Choice[] => audioList(tracks, 'Subtitles');

// Players name tracks "eng", "en", "en-US", "English" or "English [CC]". One
// name per language reads like Netflix's menu and lets a choice carry over.
const CODES: Record<string, string> = {
  eng: 'en', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', por: 'pt', ita: 'it', jpn: 'ja', kor: 'ko',
  chi: 'zh', zho: 'zh', ara: 'ar', hin: 'hi', rus: 'ru', tur: 'tr', dut: 'nl', nld: 'nl', swe: 'sv', nor: 'no',
  dan: 'da', fin: 'fi', pol: 'pl', gre: 'el', ell: 'el', heb: 'he', tha: 'th', vie: 'vi', ind: 'id', may: 'ms',
  msa: 'ms', swa: 'sw', ukr: 'uk', ces: 'cs', cze: 'cs', hun: 'hu', rum: 'ro', ron: 'ro', tam: 'ta', tel: 'te',
  fil: 'fil', tgl: 'tl', per: 'fa', fas: 'fa', urd: 'ur', ben: 'bn', amh: 'am', som: 'so', yor: 'yo', zul: 'zu',
};
let names: { of: (c: string) => string | undefined } | null = null;
function nameOf(code: string): string | null {
  try {
    if (!names) names = new Intl.DisplayNames(['en'], { type: 'language' });
    const n = names.of(code);
    return n && n !== 'root' && !/^unknown/i.test(n) && n.toLowerCase() !== code.toLowerCase() ? n : null;
  } catch { return null; }
}
/** "eng" → "English", "pt-BR" → "Brazilian Portuguese"; anything else as it came. */
export function languageLabel(raw: string): string {
  const s = raw.trim();
  const m = /^([a-z]{2,3})(?:[-_]([a-z]{2}))?$/i.exec(s);
  if (!m || /^(und|mis|mul|zxx)$/i.test(m[1])) return s;
  const base = CODES[m[1].toLowerCase()] || m[1].toLowerCase();
  return nameOf(m[2] ? `${base}-${m[2].toUpperCase()}` : base) || s;
}

/** The language a label names, lower case, for matching ("English [CC]" → "english"). */
export function languageKey(label: string): string {
  return languageLabel(label).toLowerCase().replace(/s*[([].*$/, '').replace(/(sdh|cc|forced|full|signs?)/g, '').trim();
}

/** Does this track carry the title's original language (TMDB `original_language`, e.g. "ja")? */
export function isOriginal(label: string, original?: string | null): boolean {
  if (!original) return false;
  const want = nameOf(original.toLowerCase());
  return !!want && languageKey(label).startsWith(want.toLowerCase());
}

/** What a frame reported, checked: anything on the page can post to Sahrae. */
export function readFrameOptions(raw: unknown): ChoiceLists | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { quality?: unknown; qOn?: unknown; audio?: unknown; aOn?: unknown; subs?: unknown; sOn?: unknown };
  const quality = Array.isArray(o.quality) ? qualityList(o.quality as RawLevel[]) : [];
  const audio = Array.isArray(o.audio) ? audioList(o.audio as RawLevel[]) : [];
  const subs = Array.isArray(o.subs) ? subsList(o.subs as RawLevel[]) : [];
  if (quality.length < 2 && audio.length < 2 && !subs.length) return null;
  return {
    quality,
    qualityOn: typeof o.qOn === 'number' ? o.qOn : -1,
    audio,
    audioOn: typeof o.aOn === 'number' ? o.aOn : -1,
    subs,
    subsOn: typeof o.sOn === 'number' ? o.sOn : -1,
  };
}

export const hasChoices = (c: PlayerChoices | null | undefined): c is PlayerChoices =>
  !!c && (c.quality.length > 1 || c.audio.length > 1 || c.subs.length > 0);

/** Audio & Subtitles has something to offer (the Netflix panel). */
export const hasLanguages = (c: PlayerChoices | null | undefined): c is PlayerChoices =>
  !!c && (c.audio.length > 1 || c.subs.length > 0);
