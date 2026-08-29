/**
 * Equalizer settings → native global audio effects (see AudioFx.java).
 *
 * The 5 sliders are gains in millibels (-1500..+1500), low→high. `bass` and
 * `spatial` (virtualizer) are 0..1000. Settings persist in localStorage and are
 * pushed to the native layer via the /__eq intercept (no-op on web).
 */
import { applyWebEq } from './eqWeb';

export interface EqSettings {
  on: boolean;
  bands: number[]; // 5 values, millibels
  bass: number;    // 0..1000
  spatial: number; // 0..1000 (virtualizer)
  loud: number;    // 0..2000 (loudness enhancer target gain, mB)
  preset: string;
}

export const EQ_FREQS = ['60Hz', '230Hz', '910Hz', '3.6kHz', '14kHz'];

export const EQ_PRESETS: Record<string, number[]> = {
  Premium:       [500, 150, -50, 250, 550],
  Flat:          [0, 0, 0, 0, 0],
  'Bass Boost':  [1100, 650, 150, 0, 200],
  'Super Bass':  [1500, 1000, 300, -100, 0],
  Treble:        [0, 0, 100, 600, 1100],
  Vocal:         [-300, -100, 500, 400, -100],
  'R&B':         [700, 400, -100, 200, 600],
  Pop:           [-100, 300, 500, 300, -100],
  Rock:          [600, 300, -200, 300, 700],
  Jazz:          [400, 200, -100, 200, 400],
  Live:          [-200, 200, 350, 350, 250],
  Cinema:        [600, 250, 0, 300, 700],
};

// Presets that also dial in bass / spatial / loudness for a fuller, "mastered"
// sound (the rest leave those controls untouched).
export const PRESET_EXTRAS: Record<string, { bass: number; spatial: number; loud: number }> = {
  Premium:      { bass: 480, spatial: 700, loud: 700 },
  Cinema:       { bass: 550, spatial: 850, loud: 450 },
  'Bass Boost': { bass: 750, spatial: 250, loud: 250 },
  'Super Bass': { bass: 1000, spatial: 250, loud: 350 },
};

const KEY = 'sahrae.eq.v1';
const DEFAULT: EqSettings = { on: false, bands: [0, 0, 0, 0, 0], bass: 0, spatial: 0, loud: 0, preset: 'Flat' };

export function loadEq(): EqSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.bands)) return { ...DEFAULT, ...s, bands: s.bands.slice(0, 5) };
  } catch { /* ignore */ }
  return { ...DEFAULT };
}

export function applyEq(s: EqSettings): void {
  const b = s.bands;
  const q =
    `on=${s.on ? 1 : 0}` +
    `&b0=${b[0] | 0}&b1=${b[1] | 0}&b2=${b[2] | 0}&b3=${b[3] | 0}&b4=${b[4] | 0}` +
    `&bass=${s.bass | 0}&virt=${s.spatial | 0}&loud=${s.loud | 0}`;
  fetch(`https://localhost/__eq?${q}`).catch(() => {});
}

export function saveEq(s: EqSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  applyEq(s);
}
