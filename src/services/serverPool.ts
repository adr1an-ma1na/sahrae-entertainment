import { useEffect, useState } from 'react';
import bundled from '../data/servers.json';
import { supabase } from '../supabase';
import { pickServers, validPool, type Pool, type PoolServer, type ServerHealth } from './serverPoolRank';

export { fill, label, score, type PoolServer } from './serverPoolRank';

/**
 * The movie and series servers, kept current without an app update.
 *
 * Every build carries src/data/servers.json, so the app works offline and on
 * first launch. The same file is published beside the web app, and a daily job
 * (scripts/server-health.mjs) marks servers down or back up in it, so the app
 * asks for the published copy and, when it is well formed, uses that instead.
 * Viewers' own results (play_proof) then take out a server that keeps failing
 * for them, and the next best in the pool steps in.
 */

const REMOTE = 'https://adr1an-ma1na.github.io/sahrae-entertainment/servers.json';
const CACHE_KEY = 'sahrae.serverPool.v1';
const HEALTH_HOURS = 72;
const HEALTH_CACHE_MS = 30 * 60 * 1000;
const EVENT = 'sahrae:serverpool';

let pool: Pool = bundled as Pool;
try {
  const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  if (validPool(cached) && cached.updated >= pool.updated) pool = cached;
} catch { /* nothing cached */ }

let health: ServerHealth[] = [];
let healthAt = 0;

const emit = () => { try { window.dispatchEvent(new Event(EVENT)); } catch { /* not in a browser */ } };

/** Tell the Android shell every host the pool uses, so a server added later is not treated as a stranger. */
function shareHosts(p: Pool) {
  const caps = (window as unknown as { __sahraeCaps?: { embedHosts?: boolean } }).__sahraeCaps;
  if (!caps?.embedHosts) return;
  const hosts = [...new Set(p.servers.flatMap((s) => s.hosts))].join(',');
  fetch(`https://localhost/__embedhosts?h=${encodeURIComponent(hosts)}`, { cache: 'no-store' }).catch(() => {});
}

async function refreshPool() {
  try {
    const r = await fetch(`${REMOTE}?t=${Math.floor(Date.now() / 3600000)}`, { cache: 'no-store' });
    if (!r.ok) return;
    const p = await r.json();
    if (!validPool(p)) return;
    // An older published list never overrides the one this build carries:
    // the build may be newer than the last deploy.
    if (p.updated < (bundled as Pool).updated) return;
    pool = p;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch { /* storage full: still used this session */ }
    shareHosts(p);
    emit();
  } catch { /* offline: the bundled or cached pool stands */ }
}

async function refreshHealth() {
  if (!supabase || Date.now() - healthAt < HEALTH_CACHE_MS) return;
  healthAt = Date.now();
  try {
    const { data, error } = await supabase.rpc('server_health', { p_hours: HEALTH_HOURS });
    if (error || !Array.isArray(data)) return;
    health = (data as ServerHealth[]).map((h) => ({ ...h, ok: Number(h.ok) || 0, fail: Number(h.fail) || 0 }));
    emit();
  } catch { /* function not created yet, or offline: no crowd opinion */ }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  setTimeout(() => { void refreshPool(); void refreshHealth(); }, 1500);
  window.addEventListener('sahrae:caps', () => shareHosts(pool));
}

/** The servers to offer for this kind of title, best first. Updates when the pool or viewers' results change. */
export function useServerPool(type: 'movie' | 'tv'): PoolServer[] {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener(EVENT, on);
    void refreshHealth();
    return () => window.removeEventListener(EVENT, on);
  }, []);
  // The Android app can hold adaptive players in HD (its picture floor); a browser cannot.
  const canHoldHd = (window as unknown as { __sahraeCaps?: { quality?: boolean } }).__sahraeCaps?.quality === true;
  return pickServers(pool, type, health, Date.now(), undefined, canHoldHd);
}

/** Every host any pool server uses (for checks). */
export const poolHosts = () => [...new Set(pool.servers.flatMap((s) => s.hosts))];
