import { loadScript, type CreateEmbedOptions, type EmbedController, type EmbedStatus } from './types.ts';

/**
 * Spotify's official Embed IFrame API.
 *
 * This is the sanctioned route: Spotify serves and controls the player, so
 * entitlement, ads and reporting all stay theirs. What a listener hears depends
 * on their own Spotify session in this browser — an active Premium session gets
 * full tracks, everyone else gets Spotify's 30-second preview. That is Spotify's
 * rule and their player enforces it; we surface it in the UI rather than
 * implying we can do better.
 *
 * Notably NOT used: the Web Playback SDK. It would give full tracks with
 * transport control, but it needs the `streaming` scope, an active Premium
 * account and a device registration — far more access than reading a library
 * justifies, for a Phase 2 whose remit is foreground embedded playback.
 */

const API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The API signals readiness by calling a global we must define before loading. */
let apiReady: Promise<any> | null = null;

function getIFrameApi(): Promise<any> {
  if (apiReady) return apiReady;

  apiReady = new Promise<any>((resolve, reject) => {
    const w = window as any;
    if (w.SpotifyIframeApi) { resolve(w.SpotifyIframeApi); return; }

    // Chain rather than overwrite: another part of the app may already be
    // waiting on this same global.
    const prev = w.onSpotifyIframeApiReady;
    w.onSpotifyIframeApiReady = (api: any) => {
      w.SpotifyIframeApi = api;
      if (typeof prev === 'function') prev(api);
      resolve(api);
    };

    loadScript(API_SRC).catch(reject);

    // The script can load without ever invoking the callback (blocked frame,
    // offline). Failing after a bounded wait beats a promise that never settles.
    setTimeout(() => reject(new Error('Spotify’s player did not start. Check the connection or any content blocker.')), 15000);
  }).catch((err) => {
    apiReady = null; // let the next attempt retry
    throw err;
  });

  return apiReady;
}

export async function createSpotifyEmbed(opts: CreateEmbedOptions): Promise<EmbedController> {
  const api = await getIFrameApi();

  let status: EmbedStatus = { state: 'loading', position: 0, duration: 0 };
  const listeners = new Set<(s: EmbedStatus) => void>();
  const emit = (patch: Partial<EmbedStatus>) => {
    status = { ...status, ...patch };
    listeners.forEach((fn) => { try { fn(status); } catch { /* a bad listener must not break playback */ } });
  };

  // The API replaces this element with its iframe, so give it its own node
  // rather than handing over the caller's container.
  const mount = document.createElement('div');
  mount.style.width = '100%';
  opts.container.appendChild(mount);

  const controller = await new Promise<any>((resolve, reject) => {
    const failTimer = setTimeout(
      () => reject(new Error('Spotify’s player did not finish loading.')),
      15000,
    );
    try {
      api.createController(
        mount,
        { uri: `spotify:track:${opts.providerId}` },
        (ctrl: any) => {
          clearTimeout(failTimer);

          ctrl.addListener('ready', () => {
            emit({ state: 'ready' });
            if (opts.autoplay) ctrl.play();
          });

          // Spotify reports position and duration in MILLISECONDS.
          ctrl.addListener('playback_update', (e: any) => {
            const d = e?.data || {};
            emit({
              state: d.isPaused ? 'paused' : 'playing',
              position: Number(d.position || 0) / 1000,
              duration: Number(d.duration || 0) / 1000,
            });
          });

          resolve(ctrl);
        },
      );
    } catch (err) {
      clearTimeout(failTimer);
      reject(err);
    }
  });

  return {
    provider: 'spotify',
    play: () => { try { controller.play(); } catch { /* the player is gone */ } },
    pause: () => { try { controller.pause(); } catch { /* the player is gone */ } },
    seek: (seconds) => { try { controller.seek(seconds); } catch { /* unsupported for this item */ } },
    destroy: () => {
      try { controller.destroy(); } catch { /* already torn down */ }
      listeners.clear();
      mount.remove();
    },
    onStatus: (fn) => { listeners.add(fn); fn(status); return () => listeners.delete(fn); },
    status: () => status,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
