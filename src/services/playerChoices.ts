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
  pickQuality: (id: number) => void;
  pickAudio: (id: number) => void;
}

export type ChoiceLists = Pick<PlayerChoices, 'quality' | 'qualityOn' | 'audio' | 'audioOn'>;

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

export function audioList(tracks: RawLevel[]): Choice[] {
  return tracks.flatMap((t, i) => {
    if (typeof t?.id !== 'number') return [];
    return [{ id: t.id, label: text(t.label) || `Sound ${i + 1}` }];
  }).slice(0, MAX);
}

/** What a frame reported, checked: anything on the page can post to Sahrae. */
export function readFrameOptions(raw: unknown): ChoiceLists | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { quality?: unknown; qOn?: unknown; audio?: unknown; aOn?: unknown };
  const quality = Array.isArray(o.quality) ? qualityList(o.quality as RawLevel[]) : [];
  const audio = Array.isArray(o.audio) ? audioList(o.audio as RawLevel[]) : [];
  if (quality.length < 2 && audio.length < 2) return null;
  return {
    quality,
    qualityOn: typeof o.qOn === 'number' ? o.qOn : -1,
    audio,
    audioOn: typeof o.aOn === 'number' ? o.aOn : -1,
  };
}

export const hasChoices = (c: PlayerChoices | null | undefined): c is PlayerChoices =>
  !!c && (c.quality.length > 1 || c.audio.length > 1);
