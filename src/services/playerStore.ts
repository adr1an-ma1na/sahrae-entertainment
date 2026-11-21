import { useSyncExternalStore } from 'react';

/**
 * Whether the film player is open, and on what, kept outside App's state.
 *
 * It used to be App state, so opening or closing the player re-rendered the whole
 * screen behind it: every shelf and every card on Home. On a TV that was a clear
 * pause on the way in and out (owner, 2026-11-21: "a pretty clear lag exiting a
 * movie"). Now only what reads it (the player itself, and Flow Channels, which
 * pauses its preview) changes when it opens or closes.
 */
export interface PlayerConfig {
  isOpen: boolean;
  mediaId: number | null;
  mediaType: 'movie' | 'tv' | null;
  startInInfo?: boolean;
  initialSeason?: number;
  initialEpisode?: number;
  playTrailer?: boolean;
}

const CLOSED: PlayerConfig = { isOpen: false, mediaId: null, mediaType: null, startInInfo: false };
let config: PlayerConfig = CLOSED;
const listeners = new Set<() => void>();
const set = (next: PlayerConfig) => { config = next; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function openPlayer(c: Omit<PlayerConfig, 'isOpen'>): void { set({ ...c, isOpen: true }); }
export function closePlayer(): void { if (config.isOpen) set(CLOSED); }


/** The whole configuration (the player). */
export function usePlayerConfig(): PlayerConfig {
  return useSyncExternalStore(subscribe, () => config, () => CLOSED);
}
/** Just open or not: changes only when that does. */
export function usePlayerOpen(): boolean {
  return useSyncExternalStore(subscribe, () => config.isOpen, () => false);
}
