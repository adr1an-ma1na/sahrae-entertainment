import { useEffect, useRef, useState } from 'react';
import type { Track } from '../../services/ytmusic';
import { compactViews, runtime, timeAgo } from './videoFormat';

/**
 * A YouTube video, laid out the way YouTube lays one out.
 *
 * Music and video want different cards and had been sharing one. A song is a
 * square cover with the title under it; a video is a 16:9 still with the runtime
 * burned into the corner, then title, channel, views and age. Using the music
 * card for videos made the YouTube tab read like an album shelf.
 *
 * PREVIEW
 * Hovering plays a muted preview, as YouTube does. It is YouTube's own IFrame
 * player, not an extracted stream — so their playback, their counting, their
 * rules. Three restraints, each for a reason:
 *
 *   - It waits. A preview that fires the instant a cursor crosses a card turns
 *     a scroll into a wall of noise.
 *   - Only one at a time, owned by the parent through `activeId`. Otherwise
 *     moving across a grid leaves a trail of players running behind you.
 *   - Muted, always. Autoplay with sound is blocked by browsers anyway, and
 *     unsolicited audio is hostile.
 *
 * Skipped entirely for reduced-motion and on touch, where there is no hover to
 * express intent with and a preview would just be a surprise.
 */

const PREVIEW_DELAY_MS = 700;

export interface VideoCardProps {
  track: Track;
  onPlay: () => void;
  /** Which card may preview right now — the parent keeps this to one. */
  activeId?: string | null;
  onHoverStart?: (id: string) => void;
  onHoverEnd?: (id: string) => void;
}

export default function VideoCard({ track, onPlay, activeId, onHoverStart, onHoverEnd }: VideoCardProps) {
  const [previewing, setPreviewing] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const canPreview = typeof window !== 'undefined'
    && window.matchMedia?.('(hover: hover)').matches
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Another card took the slot — stand down.
  useEffect(() => {
    if (activeId !== track.id && previewing) setPreviewing(false);
  }, [activeId, track.id, previewing]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const enter = () => {
    if (!canPreview) return;
    onHoverStart?.(track.id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPreviewing(true), PREVIEW_DELAY_MS);
  };
  const leave = () => {
    window.clearTimeout(timer.current);
    setPreviewing(false);
    onHoverEnd?.(track.id);
  };

  const meta = [compactViews(track.views), timeAgo(track.uploaded)].filter(Boolean).join(' · ');

  return (
    <div
      className="group w-full cursor-pointer"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      onClick={onPlay}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(); } }}
      tabIndex={0}
      data-tv-focusable
      role="button"
      aria-label={`${track.title} by ${track.artist}${meta ? `, ${meta}` : ''}`}
    >
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-zinc-800">
        {/* The still. Kept mounted under the preview so there is no flash of
            empty box while the player loads. */}
        <img
          src={track.artworkLarge || track.artwork}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {previewing && activeId === track.id && (
          <iframe
            className="absolute inset-0 w-full h-full"
            /* mute=1 is not decoration: autoplay is refused without it.
               controls=0 and modestbranding keep a preview looking like a
               preview, and YouTube still serves and counts the play. */
            src={`https://www.youtube.com/embed/${track.id}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0&start=0`}
            title={`Preview: ${track.title}`}
            allow="autoplay; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}

        {/* Runtime, bottom-right, as YouTube does it. Hidden while previewing —
            it would sit over moving video. */}
        {!!track.duration && !previewing && (
          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-white text-[11px] font-semibold tabular-nums">
            {runtime(track.duration)}
          </span>
        )}
      </div>

      <div className="pt-2.5 pb-1">
        <p className="text-sm font-semibold text-white leading-snug line-clamp-2 group-hover:text-sauti transition-colors">
          {track.title}
        </p>
        <p className="text-xs text-zinc-400 mt-1 truncate">{track.artist}</p>
        {meta && <p className="text-xs text-zinc-500 mt-0.5 truncate">{meta}</p>}
      </div>
    </div>
  );
}
