import { mergeScoped } from './syncKeys.ts';

/**
 * Continue Watching and My List are kept per account and profile
 * (`<prefix><uid>_<profileId>`). When an account's profile list failed to load
 * at sign-in, the app made a fresh profile with a new id, and the viewer's
 * lists, still stored under the old one, looked lost (owner, 2026-11-11).
 *
 * An account with a single profile has nobody else's list to mix in, so an
 * empty list takes what this account has under any other profile id. With
 * several profiles each keeps its own, as before.
 */
export function adoptOrphans(store: Storage, prefix: string, uid: string, current: string): unknown[] {
  const mine = [prefix + uid, `${prefix}${uid}_`];
  let merged: unknown = [];
  let found = false;
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (!k || k === current || !(k === mine[0] || k.startsWith(mine[1]))) continue;
    try {
      const list = JSON.parse(store.getItem(k) || '[]');
      if (Array.isArray(list) && list.length) { merged = mergeScoped(current, merged, list); found = true; }
    } catch { /* a damaged copy is skipped */ }
  }
  if (!found || !Array.isArray(merged)) return [];
  try { store.setItem(current, JSON.stringify(merged)); } catch { /* shown this time, kept next */ }
  return merged;
}
