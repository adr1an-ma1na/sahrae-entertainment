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

export { SYNCED_KEYS, SCOPED_PREFIXES } from './syncKeys';
import { SYNCED_KEYS, syncedKey, mergeScoped, isScopedKey } from './syncKeys';

/** The uid of the last signed-in account, for the setItem hook (which cannot wait for a lookup). */
let knownUid: string | null = null;

type Bundle = Record<string, unknown>;
interface Envelope { data: Bundle; updatedAt: number }

const LOCAL_STAMP = 'sahrae.sync.stamp.v1';

/** True once we learn the table is missing, so we stop retrying every save. */
let tableMissing = false;
/** Set while pulling, so the writes a pull causes do not bounce straight back. */
let applying = false;
/** The patch we installed, so a second start can decline rather than nest. */
let patchedSetItem: ((k: string, v: string) => void) | null = null;

function readLocal(uid: string): Bundle {
  const out: Bundle = {};
  const keys: string[] = [...SYNCED_KEYS];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !keys.includes(k) && syncedKey(k, uid)) keys.push(k);
    }
  } catch { /* storage unavailable: the fixed keys only */ }
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw !== null) out[k] = JSON.parse(raw);
    } catch { /* a corrupt key is not worth failing the whole sync for */ }
  }
  return out;
}

function writeLocal(bundle: Bundle, uid: string): void {
  applying = true;
  try {
    for (const [k, v] of Object.entries(bundle)) {
      if (!syncedKey(k, uid)) continue; // never trust the server's key list
      // Continue watching and My List are merged with this device's copy, not replaced.
      let value = v;
      if (isScopedKey(k)) {
        try { value = mergeScoped(k, JSON.parse(localStorage.getItem(k) || 'null'), v); } catch { /* corrupt local copy: take the server's */ }
      }
      try { localStorage.setItem(k, JSON.stringify(value)); } catch { /* quota */ }
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
    knownUid = data.user?.id || null;
    return knownUid;
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

    writeLocal(remote.data || {}, uid);
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

  // Before sending, fold in what other devices added to Continue watching and
  // My List since this one last pulled, so sending never drops their titles.
  try {
    const { data } = await supabase.from(TABLE).select('state').eq('user_id', uid).maybeSingle();
    const remote = (data?.state as Envelope | undefined)?.data || {};
    const scoped: Bundle = {};
    for (const [k, v] of Object.entries(remote)) if (isScopedKey(k)) scoped[k] = v;
    if (Object.keys(scoped).length) {
      writeLocal(scoped, uid);
      // Screens holding these lists read them again.
      window.dispatchEvent(new Event('sahrae:progress'));
      window.dispatchEvent(new Event('sahrae:mylist'));
    }
  } catch { /* offline: send this device's copy as it is */ }

  const now = Date.now();
  const envelope: Envelope = { data: readLocal(uid), updatedAt: now };

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
    // Watch progress ticks every 30 s while a film plays: send it once things settle.
    if (!applying && syncedKey(k, knownUid)) schedulePush(k.startsWith('sahrae_watch_progress_') ? 60_000 : 2500);
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
 * play_proof   — which movie server played which film or episode, so the next
 *                viewer starts on one that works (services/playProof.ts).
 *                Readable by all; written only through report_play, which
 *                checks its input, so nobody can write arbitrary rows.
 *                server_health sums it per server for the server pool.
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


-- 2. Shared YouTube search results. Public metadata only, no user data.
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
create index if not exists search_cache_age on search_cache (created_at);

-- 3. Which server played which title, shared so the next viewer starts on one
--    that works. Keys look like movie:27205 or tv:119051:2:1.
create table if not exists play_proof (
  title_key  text not null check (title_key ~ '^(movie:[0-9]{1,9}|tv:[0-9]{1,9}:[0-9]{1,3}:[0-9]{1,4})$'),
  server_id  text not null check (server_id ~ '^[a-z0-9]{2,20}$'),
  ok_count   integer not null default 0,
  fail_count integer not null default 0,
  last_ok    timestamptz,
  last_fail  timestamptz,
  primary key (title_key, server_id)
);

alter table play_proof enable row level security;

drop policy if exists "anyone may read" on play_proof;
create policy "anyone may read" on play_proof
  for select using (true);

-- Season look-ups ("which episodes play") match on a key prefix.
create index if not exists play_proof_prefix on play_proof (title_key text_pattern_ops);

-- The only way in: one success or failure for one title and server.
create or replace function report_play(p_title text, p_server text, p_ok boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_title !~ '^(movie:[0-9]{1,9}|tv:[0-9]{1,9}:[0-9]{1,3}:[0-9]{1,4})$'
     or p_server !~ '^[a-z0-9]{2,20}$' then
    return;
  end if;
  insert into play_proof as p (title_key, server_id, ok_count, fail_count, last_ok, last_fail)
  values (p_title, p_server,
          case when p_ok then 1 else 0 end, case when p_ok then 0 else 1 end,
          case when p_ok then now() end, case when p_ok then null else now() end)
  on conflict (title_key, server_id) do update set
    ok_count   = p.ok_count   + case when p_ok then 1 else 0 end,
    fail_count = p.fail_count + case when p_ok then 0 else 1 end,
    last_ok    = case when p_ok then now() else p.last_ok end,
    last_fail  = case when p_ok then p.last_fail else now() end;
end $$;

revoke all on function report_play(text, text, boolean) from public;
grant execute on function report_play(text, text, boolean) to anon, authenticated;

-- 4. How each server is doing for viewers, across every title, so the app can
--    stand down a server that keeps failing and bring in the next best
--    (src/services/serverPoolRank.ts, crowdFailing). Rows count when they were
--    last touched within p_hours; their counts are per title, all-time.
create or replace function server_health(p_hours integer default 72)
returns table (server_id text, ok bigint, fail bigint, last_ok timestamptz, last_fail timestamptz)
language sql stable security definer set search_path = public as $$
  select p.server_id,
         sum(p.ok_count)::bigint,
         sum(p.fail_count)::bigint,
         max(p.last_ok),
         max(p.last_fail)
  from play_proof p
  where greatest(coalesce(p.last_ok, 'epoch'::timestamptz), coalesce(p.last_fail, 'epoch'::timestamptz))
        > now() - make_interval(hours => least(greatest(coalesce(p_hours, 72), 1), 720))
  group by p.server_id;
$$;

revoke all on function server_health(integer) from public;
grant execute on function server_health(integer) to anon, authenticated;`;
