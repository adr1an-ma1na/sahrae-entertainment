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
grant execute on function server_health(integer) to anon, authenticated;
