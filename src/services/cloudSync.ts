import { supabase } from '../supabase';

/**
 * Keeps a signed-in listener's library on the server instead of only in one
 * browser.
 *
 * Everything a person builds up in Sahrae — playlists, liked songs, podcast
 * follows and progress, watch progress, My List, equaliser settings — lived in
 * localStorage alone. Clearing site data, switching phone, or opening the app on
 * a laptop started from nothing, and signing in proved who someone was without
 * carrying anything of theirs with it.
 *
 * WHAT IS AND IS NOT SYNCED
 * Only what a person would be upset to lose. Caches (TMDB responses, the sports
 * feed, YouTube quota counters), device preferences (collapsed sidebar), and
 * anything device-specific (downloaded files, OAuth tokens) stay local — copying
 * them would be worse than useless, since a download on one phone is not a
 * download on another and an access token is bound to its device.
 *
 * CONFLICTS
 * Last write wins, per key, on a timestamp. Real merge semantics would need
 * per-item versioning across six different data shapes; for a single person
 * moving between their own devices, "the most recent edit is the one you meant"
 * is right almost always and understandable when it is not. A merge that
 * silently resurrected a deleted playlist would be worse.
 *
 * DEGRADES QUIETLY
 * If the table does not exist, or the listener is signed out, or the network is
 * gone, everything still works exactly as before against localStorage. Sync is
 * an addition, never a dependency.
 */

const TABLE = 'user_state';

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
  'sahrae_watch_progress',
] as const;

type Bundle = Record<string, unknown>;
interface Envelope { data: Bundle; updatedAt: number }

const LOCAL_STAMP = 'sahrae.sync.stamp.v1';

/** True once we learn the table is missing, so we stop retrying every save. */
let tableMissing = false;
/** Set while pulling, so the writes a pull causes do not bounce straight back. */
let applying = false;
/** The patch we installed, so a second start can decline rather than nest. */
let patchedSetItem: ((k: string, v: string) => void) | null = null;

function readLocal(): Bundle {
  const out: Bundle = {};
  for (const k of SYNCED_KEYS) {
    try {
      const raw = localStorage.getItem(k);
      if (raw !== null) out[k] = JSON.parse(raw);
    } catch { /* a corrupt key is not worth failing the whole sync for */ }
  }
  return out;
}

function writeLocal(bundle: Bundle): void {
  applying = true;
  try {
    for (const [k, v] of Object.entries(bundle)) {
      if (!(SYNCED_KEYS as readonly string[]).includes(k)) continue; // never trust the server's key list
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ }
    }
  } finally {
    applying = false;
  }
}

function localStamp(): number {
  try { return Number(localStorage.getItem(LOCAL_STAMP) || 0); } catch { return 0; }
}
function setLocalStamp(t: number): void {
  try { localStorage.setItem(LOCAL_STAMP, String(t)); } catch { /* ignore */ }
}

async function currentUid(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id || null;
  } catch { return null; }
}

/**
 * Pull the server copy and apply it when it is newer than this device's.
 *
 * Returns whether anything was applied, so the caller can refresh state that
 * was read at startup.
 */
export async function pull(): Promise<boolean> {
  if (!supabase || tableMissing) return false;
  const uid = await currentUid();
  if (!uid) return false;

  try {
    const { data, error } = await supabase
      .from(TABLE).select('state, updated_at').eq('user_id', uid).maybeSingle();

    if (error) {
      // 42P01 is Postgres for "relation does not exist" — the table has not been
      // created yet. Stop trying rather than erroring on every save.
      if (error.code === '42P01' || /does not exist/i.test(error.message)) tableMissing = true;
      return false;
    }
    if (!data?.state) return false;

    const remote = data.state as Envelope;
    const remoteAt = remote.updatedAt || Date.parse(data.updated_at || '') || 0;
    if (remoteAt <= localStamp()) return false; // ours is newer or identical

    writeLocal(remote.data || {});
    setLocalStamp(remoteAt);
    return true;
  } catch {
    return false;
  }
}

let pending: number | undefined;

/**
 * Push local state up.
 *
 * Debounced: liking a song writes localStorage immediately and schedules one
 * upload, so hammering the like button is one request rather than thirty.
 */
export function schedulePush(delayMs = 2500): void {
  if (!supabase || tableMissing || applying) return;
  window.clearTimeout(pending);
  pending = window.setTimeout(() => { void push(); }, delayMs);
}

export async function push(): Promise<boolean> {
  if (!supabase || tableMissing) return false;
  const uid = await currentUid();
  if (!uid) return false;

  const now = Date.now();
  const envelope: Envelope = { data: readLocal(), updatedAt: now };

  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert({ user_id: uid, state: envelope, updated_at: new Date(now).toISOString() },
        { onConflict: 'user_id' });
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message)) tableMissing = true;
      return false;
    }
    setLocalStamp(now);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start syncing.
 *
 * Pulls once, then pushes on change. `storage` only fires for OTHER tabs, so it
 * is not enough on its own — the app's own writes are caught by patching
 * setItem, which is intrusive but is the one place that sees every mutation
 * without threading a callback through every hook that owns state.
 */
export function startSync(onPulled?: () => void): () => void {
  if (!supabase) return () => {};
  // React StrictMode runs effects twice in development. Patching setItem a
  // second time would wrap the first patch, and the teardown would then restore
  // the WRAPPER as if it were the original — leaving a permanent double-push on
  // every write. Refuse the second start instead.
  if (patchedSetItem) return () => {};

  void pull().then((changed) => { if (changed) onPulled?.(); });

  const nativeSetItem = localStorage.setItem.bind(localStorage);
  const patched = (k: string, v: string) => {
    nativeSetItem(k, v);
    if (!applying && (SYNCED_KEYS as readonly string[]).includes(k)) schedulePush();
  };
  localStorage.setItem = patched as typeof localStorage.setItem;
  patchedSetItem = patched;

  // Another tab changed something — take it rather than racing it.
  const onStorage = (e: StorageEvent) => {
    if (e.key && (SYNCED_KEYS as readonly string[]).includes(e.key)) schedulePush(4000);
  };
  window.addEventListener('storage', onStorage);

  // Leaving is the moment most likely to lose an unsent change.
  const onHide = () => { if (document.hidden) void push(); };
  document.addEventListener('visibilitychange', onHide);

  return () => {
    // Only unpatch if ours is still the installed one.
    if (localStorage.setItem === patchedSetItem) localStorage.setItem = nativeSetItem;
    patchedSetItem = null;
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onHide);
    window.clearTimeout(pending);
  };
}

/** Whether the backing table is missing, so setup can be surfaced once. */
export function syncUnavailable(): boolean { return tableMissing; }

/**
 * The SQL that turns both features on. Run once in Supabase → SQL Editor.
 *
 * user_state   — a listener's library, readable and writable only by them.
 * search_cache — YouTube results shared by everyone, so the quota is spent once
 *                per query rather than once per person. Readable by all,
 *                writable by signed-in users; the rows contain nothing private,
 *                only public YouTube metadata somebody already searched for.
 */
export const SETUP_SQL = `-- 1. A listener's own library, private to them.
create table if not exists user_state (
  user_id    uuid primary key references auth.users on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_state enable row level security;

create policy "own row" on user_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- 2. Shared YouTube search results. Public metadata only — no user data.
--    Turns a 100-unit search into a one-off cost for the whole user base.
create table if not exists search_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

alter table search_cache enable row level security;

create policy "anyone may read" on search_cache
  for select using (true);

create policy "signed-in may fill" on search_cache
  for insert with check (auth.role() = 'authenticated');

create policy "signed-in may refresh" on search_cache
  for update using (auth.role() = 'authenticated');

-- Results older than a day are stale; drop them so the table stays small.
create index if not exists search_cache_age on search_cache (created_at);`;
