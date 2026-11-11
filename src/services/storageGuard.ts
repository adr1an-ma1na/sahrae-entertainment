/**
 * The device's storage for Sahrae is one small bucket (about 5 MB) shared by
 * everything it keeps. When it filled, every save threw: the app fell over on
 * "QuotaExceededError ... sahrae_notifications" and Continue Watching stopped
 * being saved, which read as the list vanishing (owner, 2026-11-11). The main
 * filler was the film details cache, whose clean-up stopped matching its keys
 * after they were renamed.
 *
 * So a full bucket now gives way: caches (anything Sahrae can fetch again) are
 * dropped, largest first, and the save goes through. The viewer's own things
 * (Continue Watching, My List, playlists, sign-in) are never dropped.
 */

/** Keys that are copies of something online, safe to drop at any time. */
const DISPOSABLE = [
  'v2-sahrae_tmdb_details_',
  'sahrae_tmdb_details_',
  'sahrae_tmdb_',
  'sahrae.dz.',
  'sahrae.yt.cache.',
  'sahrae.yt.home.',
  'sahrae.sportsFeed.',
  'sahrae.teamBadges.',
  'sahrae.titleLogos.',
  'sahrae.podcasts.categories.',
  'sahrae.serverPool.',
  'sahrae.music.learned.',
  'sahrae.music.radar.',
  'sahrae.music.dailyMixes.',
];

/** Once the bucket holds more than this, caches are trimmed at start-up. */
const TRIM_ABOVE = 3_000_000;
/** ...down to this. */
const TRIM_TO = 2_000_000;

export const isDisposable = (k: string) => DISPOSABLE.some((p) => k.startsWith(p));

export function isQuotaError(e: unknown): boolean {
  const err = e as { name?: string; code?: number } | null;
  return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);
}

/** Bytes a key takes (strings are stored as UTF-16). */
const size = (k: string, v: string | null) => (k.length + (v?.length || 0)) * 2;

function caches(store: Storage): { k: string; n: number }[] {
  const out: { k: string; n: number }[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && isDisposable(k)) out.push({ k, n: size(k, store.getItem(k)) });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** Drop caches, largest first, until `bytes` are free. Returns what was freed. */
export function freeUp(store: Storage, bytes: number, except?: string): number {
  let freed = 0;
  for (const { k, n } of caches(store)) {
    if (freed >= bytes) break;
    if (k === except) continue;
    try { store.removeItem(k); freed += n; } catch { /* already gone */ }
  }
  return freed;
}

/** Every cache, for the error screen's reset. The viewer's own things stay. */
export function clearCaches(store: Storage = localStorage): void {
  freeUp(store, Infinity);
}

/** Everything in the bucket, in bytes. */
export function storageUsed(store: Storage = localStorage): number {
  let n = 0;
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k) n += size(k, store.getItem(k)); }
  return n;
}

let installed = false;

/** Make a full bucket give way to the save, everywhere in the app. Call first thing. */
export function installStorageGuard(): void {
  if (installed || typeof Storage === 'undefined') return;
  installed = true;
  const native = Storage.prototype.setItem;
  Storage.prototype.setItem = function guardedSetItem(this: Storage, key: string, value: string) {
    try {
      return native.call(this, key, value);
    } catch (e) {
      if (!isQuotaError(e)) throw e;
      // Room for this value and a margin, so the next save does not hit the wall at once.
      freeUp(this, size(key, value) + 512_000, key);
      try {
        return native.call(this, key, value);
      } catch (e2) {
        if (!isQuotaError(e2)) throw e2;
        // A cache that does not fit is not worth anything else.
        if (isDisposable(key)) return;
        freeUp(this, Infinity, key);
        try { return native.call(this, key, value); } catch { console.warn('[storage] full: not saved', key); }
      }
    }
  };
  // A bucket already nearly full from before this release: trim it once things are quiet.
  setTimeout(() => {
    try {
      const used = storageUsed();
      if (used > TRIM_ABOVE) freeUp(localStorage, used - TRIM_TO);
    } catch { /* storage unavailable */ }
  }, 4000);
}
