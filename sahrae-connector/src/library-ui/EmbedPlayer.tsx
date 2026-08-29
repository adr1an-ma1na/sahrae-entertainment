import { useEffect, useRef, useState } from 'react';
import { createEmbed, type EmbedController, type EmbedStatus } from '../playback/embed/index.ts';
import { attachForegroundGuard, checkEmbedVisible, ForegroundGuard } from '../playback/foregroundGuard.ts';
import type { SahraeTrack } from '../types/index.ts';
import { providerName } from './ProviderBadge.tsx';

/**
 * Tier 2 player — the provider's own embed, in the foreground, visible.
 *
 * Three things this component is responsible for beyond drawing a box:
 *
 *  1. Keeping the player VISIBLE. Both providers require it, and hiding it to
 *     get audio-only playback is the pattern that gets apps removed. The
 *     container is a real sized element and `checkEmbedVisible` asserts it in
 *     development.
 *  2. Pausing when Sahrae leaves the foreground, via ForegroundGuard. Background
 *     playback of provider content is out of scope by constraint, so it is
 *     enforced in code rather than left to reviewers.
 *  3. Handing back to Tier 1 when the embed cannot play — most often a YouTube
 *     uploader who has disabled embedding, which is only discoverable when the
 *     player reports it.
 */

const fmt = (s: number): string => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export interface EmbedPlayerProps {
  track: SahraeTrack;
  /** Called when the embed cannot play and the caller should hand off instead. */
  onFallback: (reason: string) => void;
  onClose: () => void;
}

export default function EmbedPlayer({ track, onFallback, onClose }: EmbedPlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<EmbedController | null>(null);
  const [status, setStatus] = useState<EmbedStatus>({ state: 'loading', position: 0, duration: 0 });
  const [guardPaused, setGuardPaused] = useState(false);
  const [visibilityWarning, setVisibilityWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let detachGuard = () => {};
    let unsubscribe = () => {};

    const guard = new ForegroundGuard({
      onMustPause: () => {
        ctrlRef.current?.pause();
        setGuardPaused(true);
      },
      // Deliberately not auto-resuming — see ForegroundGuard. Coming back to a
      // phone and having audio start by itself is startling, and potentially
      // out loud in a room the listener has walked into since.
      onMayResume: () => setGuardPaused(true),
    });

    (async () => {
      const host = hostRef.current;
      if (!host) return;
      try {
        const ctrl = await createEmbed(track.provider, {
          container: host,
          providerId: track.providerId,
          autoplay: true,
        });
        if (cancelled) { ctrl.destroy(); return; }

        ctrlRef.current = ctrl;
        unsubscribe = ctrl.onStatus((s) => {
          setStatus(s);
          if (s.state === 'playing') guard.playbackStarted();
          if (s.state === 'ended' || s.state === 'error') guard.playbackStopped();
          // An uploader who disabled embedding is a real, common outcome, and
          // the only honest response is to hand back to the provider's own app.
          if (s.state === 'error' && s.error) onFallback(s.error);
        });
        detachGuard = attachForegroundGuard(guard);

        // Dev-only visibility assertion. Runs after layout so the measurement
        // is real rather than pre-paint zeros.
        if (import.meta.env?.DEV) {
          requestAnimationFrame(() => {
            const problem = checkEmbedVisible(host);
            if (problem) {
              setVisibilityWarning(problem);
              console.error(`[sahrae-connector] Tier 2 visibility violation: ${problem}`);
            }
          });
        }
      } catch (err) {
        if (!cancelled) onFallback(err instanceof Error ? err.message : 'The in-app player could not start.');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      detachGuard();
      ctrlRef.current?.destroy();
      ctrlRef.current = null;
    };
    // Re-create the player when the track changes: neither provider's embed
    // supports swapping the item in place without a reload.
  }, [track.provider, track.providerId, onFallback]);

  const playing = status.state === 'playing';
  const toggle = () => {
    const c = ctrlRef.current;
    if (!c) return;
    if (playing) c.pause();
    else { c.play(); setGuardPaused(false); }
  };

  const progress = status.duration > 0 ? Math.min(100, (status.position / status.duration) * 100) : 0;

  return (
    <section
      aria-label={`Now playing: ${track.title}`}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-zinc-950/95 backdrop-blur"
    >
      <div className="max-w-5xl mx-auto p-3 md:p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{track.title}</p>
            <p className="text-xs text-zinc-400 truncate">
              {track.artists.join(', ')} · playing in {providerName(track.provider)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close player"
            className="shrink-0 w-9 h-9 rounded-full border border-white/10 text-zinc-400 hover:text-white hover:border-white/25 transition-colors">
            ✕
          </button>
        </div>

        {/*
          The provider's player. Real size, never hidden — this element is the
          licensed surface, and collapsing it would be the violation.
          Spotify's embed is a compact bar; YouTube's is a 16:9 video.
        */}
        <div
          ref={hostRef}
          data-testid="embed-host"
          className={`w-full overflow-hidden rounded-xl bg-black ${
            track.provider === 'youtube' ? 'aspect-video max-h-[38vh]' : 'min-h-[152px]'
          }`}
        />

        {visibilityWarning && (
          <p role="alert" className="mt-2 text-xs text-red-300">
            {visibilityWarning}
          </p>
        )}

        {guardPaused && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <p className="text-xs text-amber-200 flex-1">
              Paused because Sahrae went to the background. In-app playback runs only while the app is on screen.
            </p>
            <button onClick={toggle}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-amber-950 shrink-0">
              Resume
            </button>
          </div>
        )}

        {/* Our own transport, driving the provider's player through its API. */}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={toggle}
            disabled={status.state === 'loading' || status.state === 'error'}
            aria-label={playing ? 'Pause' : 'Play'}
            className="w-10 h-10 rounded-full bg-amber-500 text-amber-950 font-bold flex items-center justify-center shrink-0 disabled:opacity-40">
            {playing ? '❚❚' : '▶'}
          </button>
          <span className="text-[11px] text-zinc-500 tabular-nums w-10 shrink-0">{fmt(status.position)}</span>
          <div className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] text-zinc-500 tabular-nums w-10 shrink-0 text-right">
            {status.duration ? fmt(status.duration) : '--:--'}
          </span>
        </div>

        <p className="mt-2 text-[11px] text-zinc-600">
          {track.provider === 'spotify'
            ? 'Spotify plays this. Full tracks need an active Spotify Premium session in this browser; otherwise Spotify serves a 30-second preview.'
            : 'YouTube plays this, with their player and their ads.'}
        </p>
      </div>
    </section>
  );
}
