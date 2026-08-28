/**
 * Blob storage for downloaded audio on the WEB (PWA).
 *
 * Why this exists: downloads used Capacitor's Filesystem for every platform, and
 * its web implementation stores files in IndexedDB as base64 TEXT. A 60-minute
 * episode at 128 kbps is ~57 MB of audio, which is ~76 MB once base64-encoded —
 * built up by thousands of appendFile round-trips, each one re-reading and
 * re-writing the growing string. On a shared origin like github.io that blows
 * the storage quota, the write throws, downloads.download() swallowed it, and
 * the Downloads screen simply stayed empty with no explanation.
 *
 * Storing the Blob directly is ~33% smaller, needs one write instead of
 * thousands, and gives back an object URL that <audio> can play as-is.
 *
 * Native Android keeps using Filesystem — it writes real files to private app
 * storage, which is what makes them survive a restart and stay out of the
 * device's file manager.
 */

const DB = 'sahrae-downloads';
const STORE = 'audio';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB write failed'));
    t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
  }));
}

export const blobStore = {
  put: (id: string, blob: Blob): Promise<void> => tx('readwrite', (s) => s.put(blob, id)).then(() => undefined),
  get: (id: string): Promise<Blob | undefined> => tx('readonly', (s) => s.get(id)),
  del: (id: string): Promise<void> => tx('readwrite', (s) => s.delete(id)).then(() => undefined),
};

// Object URLs are revoked when a download is removed, so a long session doesn't
// leak one per play. Keyed by track id because the same track can be requested
// repeatedly and should reuse its URL.
const urls = new Map<string, string>();

export async function objectUrlFor(id: string): Promise<string | null> {
  const existing = urls.get(id);
  if (existing) return existing;
  try {
    const blob = await blobStore.get(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  } catch { return null; }
}

export function releaseUrl(id: string): void {
  const url = urls.get(id);
  if (url) { try { URL.revokeObjectURL(url); } catch { /* already gone */ } urls.delete(id); }
}

/**
 * How much room is left, so a download that cannot possibly fit is refused with
 * a real explanation instead of failing somewhere in the middle.
 * Returns null when the browser won't say (Safari historically won't).
 */
export async function freeBytes(): Promise<number | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    if (!quota) return null;
    return Math.max(0, quota - usage);
  } catch { return null; }
}
