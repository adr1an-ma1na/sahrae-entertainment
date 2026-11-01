-- "Delete my account" (Profile, Privacy & data; src/services/accountData.ts).
--
-- Run once in the Supabase SQL editor. It lets a signed-in person delete their
-- OWN account: their synced library row and their sign-in. auth.uid() is the
-- caller, so nobody can delete anyone else, and signed-out callers are refused.
-- Until this is installed the app still deletes the library row (row-level
-- security allows that) and asks the person to email for the sign-in.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  delete from public.user_state where user_id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
