-- 1) Add friends to a group straight away (WhatsApp-style "New group → pick people").
--    Only the group's owner can add, only people who are already their friends,
--    never someone either side has blocked, and never past 300 members.
create or replace function public.add_group_members(gid uuid, people uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  added  int := 0;
  p      uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (
    select 1 from public.group_members
    where group_id = gid and user_id = me and role = 'owner'
  ) then
    raise exception 'only_owner_adds';
  end if;
  foreach p in array coalesce(people, '{}') loop
    exit when (select count(*) from public.group_members where group_id = gid) >= 300;
    continue when p = me
      or not public.are_friends(me, p)
      or public.is_blocked(me, p);
    insert into public.group_members (group_id, user_id, role, joined_at)
    values (gid, p, 'member', now_ms)
    on conflict (group_id, user_id) do nothing;
    if found then added := added + 1; end if;
  end loop;
  update public.groups set updated_at = now_ms where id = gid;
  return added;
end $$;
revoke all on function public.add_group_members(uuid, uuid[]) from public, anon;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

-- 2) When each friendship started, for the Friends history ("You and Yash
--    became friends · 3 Nov"). The return type changes, so drop and recreate.
drop function if exists public.my_people();
create function public.my_people()
returns table (
  user_id uuid, name text, avatar text, branch text, year int, section text, bio text,
  attendance_state text, share_attendance boolean,
  friend_status text, requested_by uuid,
  requested_at bigint, since bigint
)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.name, p.avatar, p.branch, p.year, p.section, p.bio,
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
