import { useEffect, useRef, useState, type FocusEvent } from 'react';

/**
 * The timing of a rotating showcase: which slide is up, and whether it is
 * moving. It holds still while pointed at or focused, while off screen or in a
 * background tab, and when the viewer has asked for less motion.
 */
export function useShowcase<T extends HTMLElement = HTMLElement>(count: number, ms: number) {
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false);
  const [away, setAway] = useState(false);
  const ref = useRef<T>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const idx = count ? i % count : 0;

  useEffect(() => {
    const el = ref.current;
    let visible = true;
    const sync = () => setAway(!visible || document.hidden);
    const io = el && 'IntersectionObserver' in window
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.35 })
      : null;
    if (el && io) io.observe(el);
    document.addEventListener('visibilitychange', sync);
    return () => { io?.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);

  const running = count > 1 && !held && !away && !reduce;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setI((x) => (x + 1) % count), ms);
    return () => clearTimeout(timer);
  }, [running, idx, count, ms]);

  const hold = {
    onMouseEnter: () => setHeld(true),
    onMouseLeave: () => setHeld(false),
    onFocusCapture: () => setHeld(true),
    onBlurCapture: (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld(false); },
  };

  return { ref, idx, go: setI, running, hold };
}
