import { useEffect, useState } from 'react';
import type HlsT from 'hls.js';

/**
 * hls.js (~520 kB) loaded the first time a stream plays, not at start-up.
 * It used to be imported by the Live TV and Sports screens, which App imports
 * up front, so every launch parsed the whole player before showing anything.
 */
let loaded: typeof HlsT | null = null;
let pending: Promise<typeof HlsT> | null = null;

function loadHls(): Promise<typeof HlsT> {
  if (!pending) pending = import('hls.js').then((m) => (loaded = m.default));
  return pending;
}

/** The hls.js class once it has loaded, else null (the caller waits a render). */
export function useHls(): typeof HlsT | null {
  const [hls, setHls] = useState<typeof HlsT | null>(loaded);
  useEffect(() => {
    if (hls) return;
    let live = true;
    // A class is a function: hand it over through an updater, or React would call it.
    loadHls().then((H) => { if (live) setHls(() => H); }).catch(() => { /* stays null: no stream */ });
    return () => { live = false; };
  }, [hls]);
  return hls;
}
