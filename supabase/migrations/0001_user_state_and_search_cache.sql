-- Sahrae — one-time setup for cross-device sync and the shared search cache.
--
-- Run once in Supabase → SQL Editor. Safe to re-run: every statement is
-- idempotent, so a second run changes nothing.
--
-- Until this exists both features detect the missing table once and stay quiet;
-- the app keeps working against localStorage exactly as before.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. user_state — a listener's own library, private to them.
--
--    Playlists, liked songs, podcast follows and progress, watch progress,
--    taste and equaliser settings. One row per person, the whole bundle as
--    JSON, last-write-wins on updated_at.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users on delete cascade,
  state      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- Without RLS enabled AND a policy, the anon key could read every user's
-- library. `to authenticated` plus the uid check means a row is reachable only
-- by the person it belongs to — enforced by the database, not by the client.
drop policy if exists "own row" on public.user_state;
create policy "own row"
  on public.user_state
  for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. search_cache — YouTube results, shared by everyone.
--
--    The YouTube quota is 10,000 units a day for the whole project and a search
--    costs 100, so roughly 95 searches shared across all users. Caching results
--    here means the first person to search a term pays for it and everyone
--    afterwards reads it free.
--
--    Rows hold public YouTube metadata only — titles, thumbnails, durations.
--    Nothing about who searched, and no user data of any kind.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.search_cache (
  cache_key  text primary key,
  payload    jsonb       not null,
  created_at timestamptz not null default now()
);

alter table public.search_cache enable row level security;

-- Readable by anyone, including signed-out visitors: a cache that only signed-in
-- users could read would still charge the quota for everybody else.
drop policy if exists "anyone may read" on public.search_cache;
create policy "anyone may read"
  on public.search_cache
  for select
  to anon, authenticated
  using (true);

-- Only signed-in users may fill it, so an anonymous client cannot stuff the
-- table with junk that other people would then be served.
drop policy if exists "signed-in may fill" on public.search_cache;
create policy "signed-in may fill"
  on public.search_cache
  for insert
  to authenticated
  with check (true);

drop policy if exists "signed-in may refresh" on public.search_cache;
create policy "signed-in may refresh"
  on public.search_cache
  for update
  to authenticated
  using (true)
  with check (true);

-- The app treats anything older than a day as stale. This index makes clearing
-- those out cheap when the table eventually needs it.
create index if not exists search_cache_created_at
  on public.search_cache (created_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- Optional housekeeping.
--
-- Nothing deletes expired rows, because nothing needs to: stale rows are simply
-- ignored by the app. If the table grows enough to be worth pruning, run this
-- occasionally, or schedule it with pg_cron.
-- ─────────────────────────────────────────────────────────────────────────────

-- delete from public.search_cache where created_at < now() - interval '7 days';
