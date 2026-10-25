import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'midnight';

/**
 * The theme a signed-in listener chose, carried between their devices by
 * cloudSync (it is one of SYNCED_KEYS), so the phone, the laptop and the TV
 * app all show the same theme. Written only when they pick one, never on
 * start-up, so a new device's default can never overwrite their choice.
 */
export const THEME_SYNC_KEY = 'sahrae.theme.v1';

const THEME_EVENT = 'sahrae:theme';
const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark' || v === 'midnight';

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
    root.classList.remove('light', 'dark', 'midnight');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // The top bar and Settings each hold this hook; a pick in one shows in both.
  useEffect(() => {
    const on = (e: Event) => { const v = (e as CustomEvent).detail; if (isTheme(v)) setTheme(v); };
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'midnight' : prev === 'midnight' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_SYNC_KEY, JSON.stringify(next)); } catch { /* storage full */ }
      setTimeout(() => window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next })), 0);
      return next;
    });
  };

  return { theme, toggleTheme };
}
