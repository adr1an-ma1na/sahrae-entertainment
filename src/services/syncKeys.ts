/**
 * Which localStorage keys the account sync carries (services/cloudSync.ts).
 * Pure, so it is testable alone (library-check.mjs).
 */

/** The keys worth carrying between devices. */
export const SYNCED_KEYS = [
  'sahrae.music.playlists.v1',
  'sahrae.music.liked.v1',
  'sahrae.music.recent.v1',
  'sahrae.music.tasteSeeds.v1',
  'sahrae.podcast.follows.v1',
  'sahrae.podcast.progress.v2',
  'sahrae.podcast.seen.v1',
  'sahrae.livetv.fav.v1',
  'sahrae.taste.genres.v1',
  'sahrae.eq.v1',
  // The chosen theme, so phone, laptop and the TV app look the same (useTheme).
  'sahrae.theme.v1',
] as const;

/**
 * Keys kept per account and profile (`<prefix><uid>` or `<prefix><uid>_<profile>`):
 * Continue watching and My List. The bare 'sahrae_watch_progress' that used to
 * sit in SYNCED_KEYS never matched these, so neither travelled between devices.
 * Only the signed-in account's own keys are sent or accepted.
 */
export const SCOPED_PREFIXES = ['sahrae_watch_progress_', 'sahrae_my_list_'] as const;

/** Is this key one to carry for account `uid`? */
export function syncedKey(k: string, uid: string | null): boolean {
  if ((SYNCED_KEYS as readonly string[]).includes(k)) return true;
  if (!uid) return false;
  return SCOPED_PREFIXES.some((p) => k === p + uid || k.startsWith(`${p}${uid}_`));
}

const isProgressKey = (k: string) => k.startsWith('sahrae_watch_progress_');

/**
 * Two copies of a per-account list (Continue watching, My List), merged rather
 * than one replacing the other. "Last write wins" let a phone left open for a
 * day overwrite the list a TV had just added to, which read as titles
 * vanishing. Every title either side has is kept; for the same title the more
 * recent entry wins. (The cost: a title removed on one device can come back
 * from another that still had it. Losing titles was the worse failure.)
 */
export function mergeScoped(key: string, local: unknown, remote: unknown): unknown {
  if (!Array.isArray(remote)) return local;
  if (!Array.isArray(local)) return remote;
  type Entry = { id?: unknown; mediaId?: unknown; timestamp?: unknown };
  const idOf = (x: Entry) => (isProgressKey(key) ? x?.mediaId : x?.id);
  const at = (x: Entry) => Number(x?.timestamp) || 0;
  const best = new Map<unknown, Entry>();
  const order: unknown[] = [];
  for (const x of [...(local as Entry[]), ...(remote as Entry[])]) {
    const id = idOf(x);
    if (id === undefined || id === null) continue;
    const cur = best.get(id);
    if (!cur) { best.set(id, x); order.push(id); } else if (at(x) > at(cur)) best.set(id, x);
  }
  const out = order.map((id) => best.get(id) as Entry);
  // Continue watching reads newest first; My List keeps this device's order, the other's additions after.
  return isProgressKey(key) ? out.sort((a, b) => at(b) - at(a)).slice(0, 30) : out;
}

export const isScopedKey = (k: string): boolean => SCOPED_PREFIXES.some((p) => k.startsWith(p));
