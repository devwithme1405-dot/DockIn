-- Permanent account deletion, run by the student themselves.
--
-- Deleting the auth user cascades (see sync_records.user_id ... on delete
-- cascade in 0001_init) to every row of their data, and frees the username so it
-- can be taken again. The client re-checks the account password before calling
-- this, so a stranger with an unlocked phone cannot wipe the account.
--
-- SECURITY DEFINER lets an ordinary signed-in user remove their own auth row,
-- which they otherwise cannot touch; it only ever deletes auth.uid(), never
-- anyone else.
create or replace function public.delete_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_me() from anon, public;
grant execute on function public.delete_me() to authenticated;
