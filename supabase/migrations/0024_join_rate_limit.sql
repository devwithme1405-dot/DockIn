-- Group codes are 6 characters (about a billion), so with hundreds of groups a
-- script that keeps guessing could eventually land in a stranger's group. This
-- caps wrong guesses: 20 wrong codes in 15 minutes and join_group answers
-- "slow down" for the rest of that window (15 minutes at most).
--
-- A wrong code no longer raises an error (an error would roll back the note of
-- the miss); it returns null, and the app shows "No group has that code".

create table if not exists public.code_misses (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists code_misses_user_at on public.code_misses (user_id, at);
create index if not exists code_misses_at on public.code_misses (at);
alter table public.code_misses enable row level security;
revoke all on public.code_misses from public, anon, authenticated;

create or replace function public.join_group(wanted text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  row    public.groups;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_allowed_email(auth.jwt() ->> 'email') then
    raise exception 'this account cannot use DockIn';
  end if;
  if (select count(*) from public.code_misses
      where user_id = me and at > now() - interval '15 minutes') >= 20 then
    raise exception 'slow_down';
  end if;

  select * into row from public.groups
  where code = upper(btrim(coalesce(wanted, ''))) and deleted_at is null;
  if row.id is null then
    insert into public.code_misses (user_id) values (me);
    delete from public.code_misses where at < now() - interval '1 day';
    return null;
  end if;
  if (select count(*) from public.group_members where group_id = row.id) >= 300 then
    raise exception 'group_full';
  end if;

  insert into public.group_members (group_id, user_id, role, joined_at)
  values (row.id, me, 'member', now_ms)
  on conflict (group_id, user_id) do nothing;
  return row;
end $$;
revoke all on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;
