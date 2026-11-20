-- Friends saw "A student" when someone's DockIn profile had no name yet (the
-- name is published from the phone a moment after sign-in). The account
-- itself always knows the name, so fall back to it everywhere a name is shown.

create or replace function public.account_name(uid uuid)
returns text language sql stable security definer set search_path = public, auth as $$
  select nullif(btrim(coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    initcap(replace(split_part(u.email, '@', 1), '.', ' '))
  )), '')
  from auth.users u where u.id = uid;
$$;
revoke all on function public.account_name(uuid) from public, anon, authenticated;

-- Fill in names that are still empty.
update public.profiles p
   set name = public.account_name(p.user_id)
 where coalesce(btrim(p.name), '') = '';

-- New profiles start with the account's name.
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  row public.profiles;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_allowed_email(auth.jwt() ->> 'email') then
    raise exception 'this account cannot use DockIn';
  end if;
  insert into public.profiles (user_id, code, name, updated_at)
  values (me, public.new_profile_code(), public.account_name(me), (extract(epoch from clock_timestamp()) * 1000)::bigint)
  on conflict (user_id) do nothing;
  update public.profiles set name = public.account_name(me)
   where user_id = me and coalesce(btrim(name), '') = '';
  select * into row from public.profiles where user_id = me;
  return row;
end $$;

create or replace function public.peek_code(wanted text)
returns table (user_id uuid, name text, avatar text, branch text, year int)
language sql stable security definer set search_path = public as $$
  select p.user_id, coalesce(nullif(btrim(p.name), ''), public.account_name(p.user_id)), p.avatar, p.branch, p.year
  from public.profiles p
  where p.code = upper(btrim(wanted))
    and p.user_id <> auth.uid()
    and auth.uid() is not null
  limit 1;
$$;

drop function if exists public.my_people();
create function public.my_people()
returns table (
  user_id uuid, name text, avatar text, branch text, year int, section text, bio text,
  attendance_state text, share_attendance boolean,
  friend_status text, requested_by uuid,
  requested_at bigint, since bigint
)
language sql stable security definer set search_path = public as $$
  select p.user_id, coalesce(nullif(btrim(p.name), ''), public.account_name(p.user_id)),
         p.avatar, p.branch, p.year, p.section, p.bio,
         case when p.share_attendance then p.attendance_state else null end,
         p.share_attendance,
         f.status, f.requested_by,
         f.created_at,
         case when f.status = 'accepted' then f.updated_at else null end
  from public.friends f
  join public.profiles p
    on p.user_id = case when f.a = auth.uid() then f.b else f.a end
  where auth.uid() in (f.a, f.b);
$$;
revoke all on function public.my_people() from public, anon;
grant execute on function public.my_people() to authenticated;

create or replace function public.group_people(gid uuid)
returns table (user_id uuid, name text, avatar text, branch text, year int, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(btrim(p.name), ''), public.account_name(m.user_id)), p.avatar, p.branch, p.year, m.role
  from public.group_members m
  left join public.profiles p on p.user_id = m.user_id
  where m.group_id = gid
    and public.is_group_member(gid, auth.uid());
$$;
