import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'midnight' | 'royal' | 'emerald' | 'rose';

/** Every theme, in picker order, with the swatch the picker paints for it. */
export const THEMES: { id: Theme; name: string; note: string; page: string; metal: string; glow: string }[] = [
  { id: 'dark', name: 'Obsidian', note: 'Black and molten gold', page: '#09090B', metal: '#FBBF24', glow: '#B45309' },
  { id: 'royal', name: 'Royal', note: 'Sapphire and champagne', page: '#060A18', metal: '#E6C06A', glow: '#4664E6' },
  { id: 'emerald', name: 'Emerald', note: 'Club green and old gold', page: '#04110C', metal: '#E8BE5E', glow: '#10A06E' },
  { id: 'rose', name: 'Rosé', note: 'Onyx and rose gold', page: '#0D0A0B', metal: '#EDA58B', glow: '#AA1E5A' },
  { id: 'light', name: 'Sand', note: 'Warm daylight', page: '#FFFCF7', metal: '#A9600A', glow: '#C98532' },
  { id: 'midnight', name: 'Cosmic', note: 'Baby blue and lavender', page: '#EAF2FF', metal: '#3D57D9', glow: '#8B5CF6' },
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

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const synced = JSON.parse(localStorage.getItem(THEME_SYNC_KEY) || 'null');
      if (isTheme(synced)) return synced;
    } catch { /* not set yet */ }
    const savedTheme = localStorage.getItem('theme');
    if (isTheme(savedTheme)) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(...THEMES.map((t) => t.id));
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
    // The phone's status bar and the browser chrome take the page colour.
    const page = THEMES.find((t) => t.id === theme)?.page;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && page) meta.setAttribute('content', page);
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
