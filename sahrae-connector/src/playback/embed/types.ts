import type { ProviderId } from '../../types/index.ts';

/**
 * One control surface over two very different embedded players.
 *
 * Spotify's IFrame API and YouTube's IFrame Player API agree on almost nothing:
 * different bootstrap, different ready callbacks, different state enums,
 * different seek units. The UI should not know any of that.
 *
 * Note what is absent: no volume, no rate, no track-swap-without-reload. Only
 * what both providers sanction and both actually implement, so the interface
 * never promises something one of them silently ignores.
 */

export type EmbedState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

export interface EmbedStatus {
  state: EmbedState;
  /** Seconds. 0 when the provider has not reported a position. */
  position: number;
  /** Seconds. 0 when unknown — Spotify's embed does not always report it. */
  duration: number;
  error?: string;
}

export interface EmbedController {
  readonly provider: ProviderId;
  play(): void;
  pause(): void;
  /** Seconds from the start. Ignored by a provider that does not support it. */
  seek(seconds: number): void;
  /** Tear down the player and release the iframe. */
  destroy(): void;
  /** Subscribe to status changes; returns an unsubscribe. */
  onStatus(fn: (s: EmbedStatus) => void): () => void;
  status(): EmbedStatus;
}

export interface CreateEmbedOptions {
  /** The element the player mounts into. Must be visible and ≥200×200. */
  container: HTMLElement;
  /** Provider-native id: a Spotify track id or a YouTube video id. */
  providerId: string;
  /** Start playing as soon as the player is ready. */
  autoplay?: boolean;
}

/** Load a third-party script once, resolving when it is ready. */
const loading = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('No document.'));
  const existing = loading.get(src);
  if (existing) return existing;

  const p = new Promise<void>((resolve, reject) => {
    const already = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (already && already.dataset.loaded === 'true') { resolve(); return; }

    const el = already || document.createElement('script');
    el.src = src;
    el.async = true;
    el.addEventListener('load', () => { el.dataset.loaded = 'true'; resolve(); });
    el.addEventListener('error', () => {
      // Let a later attempt retry rather than caching the failure forever.
      loading.delete(src);
      reject(new Error(`Could not load ${src}`));
    });
    if (!already) document.head.appendChild(el);
  });

  loading.set(src, p);
  return p;
}
