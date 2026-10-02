-- ---------------------------------------------------------------------------
-- DockIn, migration 2: friends, groups and shared assignments.
--
-- Shape of the thing:
--   * Everyone who signs in gets a row in `profiles` with an unguessable code.
--     That code (or its QR) is the only way to be added as a friend, so nobody
--     can be found by guessing an email or a name.
--   * `friends` holds one row per pair, with the two ids in a fixed order so a
--     pair can never be stored twice.
--   * `groups` + `group_members` are a class group, a hostel wing, a project team.
--   * `shares` is one assignment posted to a group or to chosen friends;
--     `share_targets` is the fan-out for the "chosen friends" case.
--
-- Everything a stranger needs to do (resolve a code, join by code) goes through
-- a SECURITY DEFINER function, so the tables themselves stay closed by RLS.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. Shared data on your own phone also syncs the state of shared items.
-- ---------------------------------------------------------------------------

alter table public.sync_records drop constraint if exists sync_records_kind_check;
alter table public.sync_records add constraint sync_records_kind_check
  check (kind in ('profile','subjects','slots','sessions','expenses','tasks','events','shareState'));

-- ---------------------------------------------------------------------------
-- 1. Profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  code             text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  name             text not null default '' check (char_length(name) <= 60),
  avatar           text check (char_length(avatar) <= 40),
  branch           text check (char_length(branch) <= 40),
  year             int  check (year between 1 and 5),
  section          text check (char_length(section) <= 12),
  bio              text check (char_length(bio) <= 120),
  -- "Safe" / "Cutting it close" / "Below target", never the actual percentage.
  attendance_state text check (attendance_state in ('none','safe','warn','danger')),
  share_attendance boolean not null default false,
  updated_at       bigint not null default 0,
  synced_at        timestamptz not null default clock_timestamp()
);

alter table public.profiles enable row level security;

-- Letters and digits that cannot be misread when someone types a code by hand.
create or replace function public.new_profile_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where code = candidate);
  end loop;
  return candidate;
end $$;

revoke all on function public.new_profile_code() from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Friends. One row per pair, ids stored smallest first.
-- ---------------------------------------------------------------------------

create table if not exists public.friends (
  id           uuid primary key default gen_random_uuid(),
  a            uuid not null references auth.users (id) on delete cascade,
  b            uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status       text not null check (status in ('pending','accepted')),
  created_at   bigint not null default 0,
  updated_at   bigint not null default 0,
  synced_at    timestamptz not null default clock_timestamp(),
  check (a < b),
  unique (a, b)
);

alter table public.friends enable row level security;
create index if not exists friends_b_idx on public.friends (b);

-- ---------------------------------------------------------------------------
-- 3. Groups
-- ---------------------------------------------------------------------------

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 50),
  emoji      text check (char_length(emoji) <= 8),
  code       text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  owner      uuid not null references auth.users (id) on delete cascade,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint,
  synced_at  timestamptz not null default clock_timestamp()
);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at bigint not null default 0,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (group_id, user_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
create index if not exists group_members_user_idx on public.group_members (user_id);

create or replace function public.new_group_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where code = candidate);
  end loop;
  return candidate;
end $$;

revoke all on function public.new_group_code() from public, anon;

-- ---------------------------------------------------------------------------
-- 4. Shared assignments
-- ---------------------------------------------------------------------------

create table if not exists public.shares (
  id         uuid primary key default gen_random_uuid(),
  author     uuid not null references auth.users (id) on delete cascade,
  group_id   uuid references public.groups (id) on delete cascade,
  kind       text not null default 'task' check (kind in ('task')),
  data       jsonb not null check (octet_length(data::text) < 20000),
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint,
  synced_at  timestamptz not null default clock_timestamp()
);

-- Only used when something is shared with chosen friends rather than a group.
create table if not exists public.share_targets (
  share_id uuid not null references public.shares (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  primary key (share_id, user_id)
);

alter table public.shares enable row level security;
alter table public.share_targets enable row level security;
create index if not exists shares_group_idx on public.shares (group_id, synced_at);
create index if not exists shares_author_idx on public.shares (author, synced_at);
create index if not exists share_targets_user_idx on public.share_targets (user_id);

-- True when the two of you have accepted each other.
create or replace function public.are_friends(a_id uuid, b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friends f
    where f.status = 'accepted'
      and f.a = least(a_id, b_id)
      and f.b = greatest(a_id, b_id)
  );
$$;

-- True when both of you are in the same group. Used inside policies, so it is
-- SECURITY DEFINER: a policy that queried group_members directly would ask
-- group_members for permission to read group_members, which never terminates.
create or replace function public.shares_group_with(a_id uuid, b_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.group_members m1
    join public.group_members m2 on m2.group_id = m1.group_id
    where m1.user_id = a_id and m2.user_id = b_id
  );
$$;

create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = uid);
$$;

-- These two exist so that a policy on `shares` never has to read `share_targets`
-- through its policy, and vice versa: without them the two tables ask each other
-- for permission forever and Postgres refuses with "infinite recursion".
create or replace function public.is_share_target(sid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.share_targets t where t.share_id = sid and t.user_id = uid);
$$;

create or replace function public.is_share_author(sid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shares s where s.id = sid and s.author = uid);
$$;

-- ---------------------------------------------------------------------------
-- 5. Keep synced_at honest on every table the app pulls by server time.
-- ---------------------------------------------------------------------------

create or replace function public.touch_synced_at()
returns trigger language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','friends','groups','group_members','shares'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before insert or update on public.%I
         for each row execute function public.touch_synced_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Row level security
-- ---------------------------------------------------------------------------

-- Profiles: yours, your friends', and anyone in a group with you.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.are_friends(user_id, (select auth.uid()))
    or public.shares_group_with(user_id, (select auth.uid()))
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_allowed_email(auth.jwt() ->> 'email'));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (user_id = (select auth.uid()));

-- Friends: both sides see the row. New rows only ever come from add_friend().
drop policy if exists friends_select on public.friends;
create policy friends_select on public.friends for select to authenticated
  using (a = (select auth.uid()) or b = (select auth.uid()));

-- Only the person who did NOT send it can accept; either side can delete.
drop policy if exists friends_update on public.friends;
create policy friends_update on public.friends for update to authenticated
  using (
    (a = (select auth.uid()) or b = (select auth.uid()))
    and requested_by <> (select auth.uid())
  )
  with check (status = 'accepted');

drop policy if exists friends_delete on public.friends;
create policy friends_delete on public.friends for delete to authenticated
  using (a = (select auth.uid()) or b = (select auth.uid()));

-- Groups: members read; the owner renames and deletes. Joining goes through
-- join_group(), creating through create_group().
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id, (select auth.uid())));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated
  using (owner = (select auth.uid()));

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id, (select auth.uid())));

-- Leave a group yourself, or be removed by the owner.
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.groups g where g.id = group_id and g.owner = (select auth.uid()))
  );

-- Shares: the author, the group, or the chosen friends.
drop function if exists public.can_see_share(uuid, uuid);

drop policy if exists shares_select on public.shares;
create policy shares_select on public.shares for select to authenticated
  using (
    author = (select auth.uid())
    or (group_id is not null and public.is_group_member(group_id, (select auth.uid())))
    or public.is_share_target(id, (select auth.uid()))
  );

drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares for insert to authenticated
  with check (
    author = (select auth.uid())
    and public.is_allowed_email(auth.jwt() ->> 'email')
    and (group_id is null or public.is_group_member(group_id, (select auth.uid())))
  );

-- Only the person who posted it can edit or withdraw it.
drop policy if exists shares_update on public.shares;
create policy shares_update on public.shares for update to authenticated
  using (author = (select auth.uid()))
  with check (author = (select auth.uid()));

drop policy if exists shares_delete on public.shares;
create policy shares_delete on public.shares for delete to authenticated
  using (author = (select auth.uid()));

drop policy if exists share_targets_select on public.share_targets;
create policy share_targets_select on public.share_targets for select to authenticated
  using (user_id = (select auth.uid()) or public.is_share_author(share_id, (select auth.uid())));

-- You may only name people you are actually friends with.
drop policy if exists share_targets_insert on public.share_targets;
create policy share_targets_insert on public.share_targets for insert to authenticated
  with check (
    public.is_share_author(share_id, (select auth.uid()))
    and public.are_friends(user_id, (select auth.uid()))
  );

drop policy if exists share_targets_delete on public.share_targets;
create policy share_targets_delete on public.share_targets for delete to authenticated
  using (public.is_share_author(share_id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- 7. The few things that need to reach past RLS, each narrow on purpose.
-- ---------------------------------------------------------------------------

-- Make sure I have a profile, and give me my code.
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
  insert into public.profiles (user_id, code, updated_at)
  values (me, public.new_profile_code(), (extract(epoch from clock_timestamp()) * 1000)::bigint)
  on conflict (user_id) do nothing;
  select * into row from public.profiles where user_id = me;
  return row;
end $$;

-- What a code shows before you send a request: a name and a picture, nothing else.
create or replace function public.peek_code(wanted text)
returns table (user_id uuid, name text, avatar text, branch text, year int)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.name, p.avatar, p.branch, p.year
  from public.profiles p
  where p.code = upper(btrim(wanted))
    and p.user_id <> auth.uid()
    and auth.uid() is not null
  limit 1;
$$;

-- Send a friend request using someone's code. Re-running it is harmless, and
-- using the code of someone who already asked you accepts their request instead.
create or replace function public.add_friend(wanted text)
returns public.friends language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  them   uuid;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  row    public.friends;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_allowed_email(auth.jwt() ->> 'email') then
    raise exception 'this account cannot use DockIn';
  end if;

  select p.user_id into them from public.profiles p where p.code = upper(btrim(wanted));
  if them is null then raise exception 'no_such_code'; end if;
  if them = me then raise exception 'thats_you'; end if;

  insert into public.friends (a, b, requested_by, status, created_at, updated_at)
  values (least(me, them), greatest(me, them), me, 'pending', now_ms, now_ms)
  on conflict (a, b) do update
    set status     = case when public.friends.requested_by <> me then 'accepted' else public.friends.status end,
        updated_at = now_ms
  returning * into row;
  return row;
end $$;

create or replace function public.create_group(group_name text, group_emoji text default null)
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
  if (select count(*) from public.group_members where user_id = me) >= 50 then
    raise exception 'too_many_groups';
  end if;

  insert into public.groups (name, emoji, code, owner, created_at, updated_at)
  values (btrim(group_name), group_emoji, public.new_group_code(), me, now_ms, now_ms)
  returning * into row;

  insert into public.group_members (group_id, user_id, role, joined_at)
  values (row.id, me, 'owner', now_ms);
  return row;
end $$;

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

  select * into row from public.groups
  where code = upper(btrim(wanted)) and deleted_at is null;
  if row.id is null then raise exception 'no_such_group'; end if;
  if (select count(*) from public.group_members where group_id = row.id) >= 300 then
    raise exception 'group_full';
  end if;

  insert into public.group_members (group_id, user_id, role, joined_at)
  values (row.id, me, 'member', now_ms)
  on conflict (group_id, user_id) do nothing;
  return row;
end $$;

-- Everyone in my groups and everyone I am friends with, in one call, so the
-- Friends screen is a single round trip.
create or replace function public.my_people()
returns table (
  user_id uuid, name text, avatar text, branch text, year int, section text, bio text,
  attendance_state text, share_attendance boolean,
  friend_status text, requested_by uuid
)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.name, p.avatar, p.branch, p.year, p.section, p.bio,
         case when p.share_attendance then p.attendance_state else null end,
         p.share_attendance,
         f.status, f.requested_by
  from public.friends f
  join public.profiles p
    on p.user_id = case when f.a = auth.uid() then f.b else f.a end
  where auth.uid() in (f.a, f.b);
$$;

-- Group members with their names, for the group screen.
create or replace function public.group_people(gid uuid)
returns table (user_id uuid, name text, avatar text, branch text, year int, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.name, p.avatar, p.branch, p.year, m.role
  from public.group_members m
  left join public.profiles p on p.user_id = m.user_id
  where m.group_id = gid
    and public.is_group_member(gid, auth.uid());
$$;

revoke all on function public.ensure_profile()           from public, anon;
revoke all on function public.peek_code(text)            from public, anon;
revoke all on function public.add_friend(text)           from public, anon;
revoke all on function public.create_group(text, text)   from public, anon;
revoke all on function public.join_group(text)           from public, anon;
revoke all on function public.my_people()                from public, anon;
revoke all on function public.group_people(uuid)         from public, anon;
revoke all on function public.are_friends(uuid, uuid)    from public, anon;
revoke all on function public.shares_group_with(uuid, uuid) from public, anon;
revoke all on function public.is_group_member(uuid, uuid)   from public, anon;
revoke all on function public.is_share_target(uuid, uuid)   from public, anon;
revoke all on function public.is_share_author(uuid, uuid)   from public, anon;

grant execute on function public.ensure_profile()         to authenticated;
grant execute on function public.peek_code(text)          to authenticated;
grant execute on function public.add_friend(text)         to authenticated;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(text)         to authenticated;
grant execute on function public.my_people()              to authenticated;
grant execute on function public.group_people(uuid)       to authenticated;
grant execute on function public.are_friends(uuid, uuid)  to authenticated;
grant execute on function public.shares_group_with(uuid, uuid) to authenticated;
grant execute on function public.is_group_member(uuid, uuid)   to authenticated;
grant execute on function public.is_share_target(uuid, uuid) to authenticated;
grant execute on function public.is_share_author(uuid, uuid) to authenticated;

grant select, insert, update, delete on public.profiles      to authenticated;
grant select, update, delete         on public.friends       to authenticated;
grant select, update, delete         on public.groups        to authenticated;
grant select, delete                 on public.group_members to authenticated;
grant select, insert, update, delete on public.shares        to authenticated;
grant select, insert, delete         on public.share_targets to authenticated;
