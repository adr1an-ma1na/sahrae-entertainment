import { useEffect, useRef, useState } from 'react';
import { ChevronsRight, SkipForward } from 'lucide-react';
import { segmentAt, skipLabel, skipTarget, type Segment } from '../services/skipSegments';
import { isTelevision, tvFocus, setTvPriorityAction, clearTvPriorityAction } from '../tv/spatialNavigation';

/**
 * The player's clock, from whichever player is running (Sahrae's own, a
 * server's PLAYER_EVENT, or the app's frame helper). An event rather than
 * state, so the whole player page does not redraw every second.
 */
export const CLOCK_EVENT = 'sahrae:clock';
export function tellClock(t: number, d: number, paused?: boolean): void {
  if (!(t >= 0)) return;
  try { window.dispatchEvent(new CustomEvent(CLOCK_EVENT, { detail: { t, d, paused } })); } catch { /* no window */ }
}

/**
 * Skip Intro / Skip Recap / Next Episode, over the picture while that part
 * plays (services/skipSegments.ts). On a TV it takes the remote's focus as it
 * appears, so OK skips, and hands it back when the part is over.
 */
export default function SkipButton({ segments, hasNext, canSeek, hidden, onSeek, onNext }: {
  segments: Segment[];
  hasNext: boolean;
  /** This player can be moved on in place (or reloaded at a second). */
  canSeek: boolean;
  hidden?: boolean;
  onSeek: (to: number) => void;
  onNext: () => void;
}) {
  const [seg, setSeg] = useState<Segment | null>(null);
  const durRef = useRef(0);
  const pressed = useRef(new Set<Segment>());

  useEffect(() => {
    setSeg(null);
    pressed.current = new Set();
    durRef.current = 0;
    if (!segments.length) return;
    const on = (e: Event) => {
      const { t, d } = ((e as CustomEvent).detail || {}) as { t?: number; d?: number };
      if (typeof d === 'number' && d > 0 && d !== Infinity) durRef.current = d;
      const s = typeof t === 'number' ? segmentAt(segments, t, durRef.current) : null;
      setSeg(s && !pressed.current.has(s) ? s : null);
    };
    window.addEventListener(CLOCK_EVENT, on);
    return () => window.removeEventListener(CLOCK_EVENT, on);
  }, [segments]);

  const toNext = !!seg && (seg.kind === 'credits' || seg.kind === 'preview');
  const label = seg ? skipLabel(seg, hasNext) : null;
  const usable = !hidden && !!label && (toNext ? hasNext : canSeek);

  const btn = useRef<HTMLButtonElement>(null);
  const pressRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!usable || !isTelevision()) return;
    const before = document.activeElement as HTMLElement | null;
    // OK skips while the button is up, wherever the remote's focus was resting
    // (the picture, or a server's frame), not only once the ring reaches it.
    const fire = () => pressRef.current();
    setTvPriorityAction(fire);
    if (btn.current) tvFocus(btn.current);
    const id = requestAnimationFrame(() => { if (btn.current && document.activeElement !== btn.current) tvFocus(btn.current); });
    return () => {
      clearTvPriorityAction(fire);
      cancelAnimationFrame(id);
      const now = document.activeElement;
      if (before && before !== document.body && before.isConnected && (!now || now === document.body || now === btn.current)) tvFocus(before);
    };
  }, [usable, seg]);

  const press = () => {
    if (!seg) return;
    pressed.current.add(seg);
    setSeg(null);
    if (toNext) { onNext(); return; }
    const to = skipTarget(seg, durRef.current);
    if (to !== null) onSeek(to);
  };
  pressRef.current = press;
  if (!usable || !seg) return null;
  return (
    <button ref={btn} type="button" onClick={press} data-tv-focusable data-tv-priority
      className="absolute z-40 bottom-12 right-3 md:bottom-20 md:right-8 h-10 md:h-12 px-4 md:px-6 rounded-md bg-black/70 text-white text-sm md:text-base font-bold flex items-center gap-2 border-2 border-white/80 backdrop-blur shadow-2xl hover:bg-white hover:text-black focus:bg-white focus:text-black transition-colors animate-in fade-in slide-in-from-right-2 duration-200">
      {toNext ? <SkipForward className="w-5 h-5 fill-current" /> : <ChevronsRight className="w-5 h-5" />}
      {label}
    </button>
  );
}
