import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'midnight' | 'royal' | 'emerald' | 'rose' | 'powder' | 'roastery' | 'orchid' | 'citrus' | 'electric' | 'visionary' | 'racing' | 'acid' | 'sweet';

/** Every theme, in picker order, with the swatch the picker paints for it. */
export const THEMES: { id: Theme; name: string; note: string; page: string; metal: string; glow: string }[] = [
  { id: 'dark', name: 'Obsidian', note: 'Black and molten gold', page: '#09090B', metal: '#FBBF24', glow: '#B45309' },
  { id: 'royal', name: 'Royal', note: 'Sapphire and champagne', page: '#060A18', metal: '#E6C06A', glow: '#4664E6' },
  { id: 'emerald', name: 'Emerald', note: 'Club green and old gold', page: '#04110C', metal: '#E8BE5E', glow: '#10A06E' },
  { id: 'rose', name: 'Rosé', note: 'Onyx and rose gold', page: '#0D0A0B', metal: '#EDA58B', glow: '#AA1E5A' },
  { id: 'light', name: 'Sand', note: 'Warm daylight', page: '#FFFCF7', metal: '#A9600A', glow: '#C98532' },
  { id: 'midnight', name: 'Cosmic', note: 'Baby blue and lavender', page: '#EAF2FF', metal: '#3D57D9', glow: '#8B5CF6' },
  // From the owner's reels (2026-11-17): two colours set the mood, the third is the accent.
  { id: 'powder', name: 'Powder', note: 'Glacier blue, navy, lemon', page: '#071530', metal: '#FFE53B', glow: '#8DC3F0' },
  { id: 'roastery', name: 'Roastery', note: 'Deep teal, cream, orange', page: '#052522', metal: '#F26A1C', glow: '#0D4A44' },
  { id: 'orchid', name: 'Orchid', note: 'Cream, ink, orchid pink', page: '#F3EEE4', metal: '#DD5FD3', glow: '#DD5FD3' },
  { id: 'citrus', name: 'Citrus', note: 'Forest green, mandarin, crest yellow', page: '#012A20', metal: '#E0F354', glow: '#FD550A' },
  { id: 'electric', name: 'Electric', note: 'Onyx, electric indigo, tropical mint', page: '#01010D', metal: '#88F9C0', glow: '#6331FB' },
  { id: 'visionary', name: 'Visionary', note: 'Seal blue, navy, crimson pink', page: '#DBF2FC', metal: '#FD6E88', glow: '#072D59' },
  { id: 'racing', name: 'Racing', note: 'Obsidian, ice grey, racing red', page: '#111217', metal: '#EF233C', glow: '#DFE5EB' },
  { id: 'acid', name: 'Acid', note: 'Deep charcoal, electric violet, acid lime', page: '#18181C', metal: '#B9F500', glow: '#723BFA' },
  { id: 'sweet', name: 'Sweet', note: 'Raspberry, pale pink, butter yellow', page: '#FFE6EE', metal: '#FFE164', glow: '#BC164D' },
];

/**
 * The theme a signed-in listener chose, carried between their devices by
 * cloudSync (it is one of SYNCED_KEYS), so the phone, the laptop and the TV
 * app all show the same theme. Written only when they pick one, never on
 * start-up, so a new device's default can never overwrite their choice.
 */
export const THEME_SYNC_KEY = 'sahrae.theme.v1';

const THEME_EVENT = 'sahrae:theme';
const isTheme = (v: unknown): v is Theme => THEMES.some((t) => t.id === v);

/** Themes with a pale page: the opening and the sidebar art draw a day, not a night. */
const LIGHT = new Set<Theme>(['light', 'midnight', 'orchid', 'visionary', 'sweet']);
export const isLightTheme = (t: Theme) => LIGHT.has(t);

/** The theme this device should open in: the synced choice, the last one used, or the system's. */
export function storedTheme(): Theme {
  try {
    const synced = JSON.parse(localStorage.getItem(THEME_SYNC_KEY) || 'null');
    if (isTheme(synced)) return synced;
    const saved = localStorage.getItem('theme');
    if (isTheme(saved)) return saved;
  } catch { /* not set yet */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Put a theme on the page. Called before the first frame (main.tsx) as well
 * as on every change: the opening is drawn before any component that used to
 * apply the theme had mounted, so it opened in the default colours, not the
 * viewer's (owner, 2026-11-17: "match the selected theme").
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove(...THEMES.map((t) => t.id));
  root.classList.add(theme);
  root.dataset.mode = isLightTheme(theme) ? 'light' : 'dark';
  const page = THEMES.find((t) => t.id === theme)?.page;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && page) meta.setAttribute('content', page);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem('theme', theme); } catch { /* storage full */ }
  }, [theme]);

  // The top bar and Settings each hold this hook; a pick in one shows in both.
  useEffect(() => {
    const on = (e: Event) => { const v = (e as CustomEvent).detail; if (isTheme(v)) setTheme(v); };
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);

  const pick = (next: Theme) => {
    setTheme(next);
    try { localStorage.setItem(THEME_SYNC_KEY, JSON.stringify(next)); } catch { /* storage full */ }
    setTimeout(() => window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next })), 0);
  };

  /** Next theme in picker order (kept for callers that cycle). */
  const toggleTheme = () => {
    const i = THEMES.findIndex((t) => t.id === theme);
    pick(THEMES[(i + 1) % THEMES.length].id);
  };

  return { theme, toggleTheme, pick };
}
