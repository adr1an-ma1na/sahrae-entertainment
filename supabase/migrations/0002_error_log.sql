-- Sahrae — where uncaught errors go.
--
-- Run once in Supabase → SQL Editor. Idempotent: safe to run twice.
--
-- Errors were being captured on-device and going nowhere, so a failure was only
-- ever visible if someone reported it. This is the destination.

create table if not exists public.error_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  kind       text        not null,
  message    text        not null,
  source     text,
  stack      text,
  url        text,
  ua         text,
  build      text
);

alter table public.error_log enable row level security;

-- INSERT ONLY, and for anyone.
--
-- Anyone, because the errors most worth seeing are the ones that stop somebody
-- signing in — requiring a session would filter out exactly the failures that
-- matter most.
--
-- Insert only, because a client has no business reading other people's errors:
-- stack traces and URLs from someone else's session are none of its concern.
-- Read them from the dashboard, where you are already authenticated.
drop policy if exists "anyone may report" on public.error_log;
create policy "anyone may report"
  on public.error_log
  for insert
  to anon, authenticated
  with check (true);

-- No select policy is defined on purpose. With RLS enabled and no policy for
-- SELECT, reads return nothing to any client key — the absence is the control.

-- Newest first is the only way this table is ever read.
create index if not exists error_log_at on public.error_log (at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- Housekeeping.
--
-- An open insert endpoint can be written to by anyone who has the publishable
-- key, which is in the app bundle and therefore public. The client caps itself
-- at 20 reports per session and de-duplicates, but that is politeness, not
-- enforcement.
--
-- If the table is ever abused, the fix is to drop the policy — reporting stops,
-- nothing else breaks. Worth a look at the row count occasionally.
-- ─────────────────────────────────────────────────────────────────────────────

-- delete from public.error_log where at < now() - interval '30 days';

-- What you will actually run to read it:
--   select at, kind, message, source, build, count(*) over () as total
--   from public.error_log order by at desc limit 100;
