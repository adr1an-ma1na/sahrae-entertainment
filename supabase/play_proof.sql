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
