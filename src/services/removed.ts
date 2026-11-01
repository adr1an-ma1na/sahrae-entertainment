/**
 * Titles removed at a rights holder's request (Copyright & takedown, in the
 * Legal centre). The list ships with the app and is published beside the
 * website (vite.config.ts), so an installed app stops offering a removed title
 * the next time it opens, without an update. A removed title shows its page but
 * will not play, and says why.
 */
import { useEffect, useState } from 'react';
import bundled from '../data/removed.json';
import { validRemoved as valid, mergeRemoved, isRemoved, type Removed } from './removedCore';
export { mergeRemoved, isRemoved, type Removed };

const REMOTE = 'https://adr1an-ma1na.github.io/sahrae-entertainment/removed.json';
const KEY = 'sahrae.removed.v1';

let current: Removed = (() => {
  let kept: Removed | null = null;
  try { const k = JSON.parse(localStorage.getItem(KEY) || 'null'); if (valid(k)) kept = k; } catch { /* none kept */ }
  return mergeRemoved(bundled as Removed, kept);
})();
let fetched = false;

async function refresh(): Promise<Removed> {
  if (fetched) return current;
  fetched = true;
  try {
    const r = await fetch(`${REMOTE}?t=${Math.floor(Date.now() / 3600000)}`, { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (valid(j)) {
      current = mergeRemoved(bundled as Removed, j);
      try { localStorage.setItem(KEY, JSON.stringify({ movie: j.movie, tv: j.tv })); } catch { /* storage full */ }
    }
  } catch { /* offline: the last list known stands */ }
  return current;
}

/** The removed list, refreshed once per session from the published copy. */
export function useRemoved(): Removed {
  const [list, setList] = useState(current);
  useEffect(() => { let on = true; void refresh().then((l) => { if (on) setList(l); }); return () => { on = false; }; }, []);
  return list;
}
