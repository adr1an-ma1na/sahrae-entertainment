import { loadScript, type CreateEmbedOptions, type EmbedController, type EmbedStatus } from './types.ts';

/**
 * YouTube's official IFrame Player API.
 *
 * YouTube serves the player, so their ads, entitlement and view counting all
 * stay intact and the play lands with the creator. We drive transport; we never
 * touch the media.
 *
 * The player stays visible. YouTube's terms require it, and hiding it to get
 * audio-only playback is precisely the pattern that gets an app removed — see
 * foregroundGuard.checkEmbedVisible, which fails loudly in development if the
 * container is ever collapsed or hidden.
 */

const API_SRC = 'https://www.youtube.com/iframe_api';

/* eslint-disable @typescript-eslint/no-explicit-any */

let apiReady: Promise<any> | null = null;

function getYT(): Promise<any> {
  if (apiReady) return apiReady;

  apiReady = new Promise<any>((resolve, reject) => {
    const w = window as any;
    if (w.YT?.Player) { resolve(w.YT); return; }

    // Chain rather than clobber — the host app may already be waiting on this.
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(w.YT);
    };

    loadScript(API_SRC).catch(reject);
    setTimeout(() => reject(new Error('YouTube’s player did not start. Check the connection or any content blocker.')), 15000);
  }).catch((err) => {
    apiReady = null;
    throw err;
  });

  return apiReady;
}

/** YT.PlayerState numbers → our vocabulary. */
function mapState(code: number): EmbedStatus['state'] {
  switch (code) {
    case 1: return 'playing';
    case 2: return 'paused';
    case 0: return 'ended';
    case 3: return 'loading'; // buffering
    case 5: return 'ready';   // cued
    default: return 'idle';
  }
}

export async function createYouTubeEmbed(opts: CreateEmbedOptions): Promise<EmbedController> {
  const YT = await getYT();

  let status: EmbedStatus = { state: 'loading', position: 0, duration: 0 };
  const listeners = new Set<(s: EmbedStatus) => void>();
  const emit = (patch: Partial<EmbedStatus>) => {
    status = { ...status, ...patch };
    listeners.forEach((fn) => { try { fn(status); } catch { /* ignore a bad listener */ } });
  };

  const mount = document.createElement('div');
  mount.style.width = '100%';
  mount.style.height = '100%';
  opts.container.appendChild(mount);

  const player: any = await new Promise((resolve, reject) => {
    const failTimer = setTimeout(() => reject(new Error('YouTube’s player did not finish loading.')), 15000);
    try {
      const p = new YT.Player(mount, {
        videoId: opts.providerId,
        playerVars: {
          // `origin` is required by YouTube when using the JS API, and omitting
          // it is the usual cause of a player that loads but never responds.
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            clearTimeout(failTimer);
            emit({ state: 'ready', duration: Number(p.getDuration?.() || 0) });
            if (opts.autoplay) { try { p.playVideo(); } catch { /* autoplay may be blocked */ } }
            resolve(p);
          },
          onStateChange: (e: any) => {
            emit({
              state: mapState(Number(e?.data)),
              position: Number(p.getCurrentTime?.() || 0),
              duration: Number(p.getDuration?.() || 0),
            });
          },
          onError: (e: any) => {
            const code = Number(e?.data);
            // 101/150 are "the uploader disallowed embedding" — a real and
            // common outcome, and the one case where Tier 2 must hand back to
            // Tier 1 rather than showing a dead player.
            const msg = code === 101 || code === 150
              ? 'The uploader does not allow this video to be played outside YouTube.'
              : code === 100
                ? 'That video is unavailable.'
                : 'YouTube could not play that video.';
            emit({ state: 'error', error: msg });
          },
        },
      });
    } catch (err) {
      clearTimeout(failTimer);
      reject(err);
    }
  });

  // YouTube pushes state changes but not position, so poll while playing. 1s is
  // enough for a progress bar and cheap; the interval is cleared on destroy.
  const tick = window.setInterval(() => {
    if (status.state !== 'playing') return;
    emit({ position: Number(player.getCurrentTime?.() || 0), duration: Number(player.getDuration?.() || 0) });
  }, 1000);

  return {
    provider: 'youtube',
    play: () => { try { player.playVideo(); } catch { /* gone */ } },
    pause: () => { try { player.pauseVideo(); } catch { /* gone */ } },
    seek: (seconds) => { try { player.seekTo(seconds, true); } catch { /* gone */ } },
    destroy: () => {
      window.clearInterval(tick);
      try { player.destroy(); } catch { /* already torn down */ }
      listeners.clear();
      mount.remove();
    },
    onStatus: (fn) => { listeners.add(fn); fn(status); return () => listeners.delete(fn); },
    status: () => status,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
