import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A horizontal shelf's scroll state: whether there is more to either side, and
 * a page-at-a-time scroll for the header's arrows.
 */
export function useRail<T extends HTMLElement = HTMLDivElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const check = () => {
      if (!el) return;
      setCanPrev(el.scrollLeft > 4);
      setCanNext(Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 4);
    };
    el?.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    // After layout, so scrollWidth counts every card.
    const t = setTimeout(check, 100);
    return () => {
      el?.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const page = useCallback((dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: el.scrollLeft + dir * el.clientWidth * 0.85, behavior: 'smooth' });
  }, []);

  return { ref, canPrev, canNext, prev: () => page(-1), next: () => page(1) };
}
