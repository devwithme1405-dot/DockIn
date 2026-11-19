-- Friends, round two: blocking, polls, mute/pin, documents in chat.
-- Run once in the Supabase SQL editor, after 0013. Safe to run again.

-- ---------------------------------------------------------------------------
-- Blocking
-- ---------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.blocks enable row level security;
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for all to authenticated
  using (blocker = auth.uid()) with check (blocker = auth.uid());

create or replace function public.is_blocked(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker = x and blocked = y) or (blocker = y and blocked = x)
  );
$$;
revoke all on function public.is_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;

-- A friend request between blocked people never gets in, however it is sent.
create or replace function public.refuse_blocked_friend()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked(new.a, new.b) then
    raise exception 'blocked';
  end if;
  return new;
end;
$$;
drop trigger if exists friends_no_blocked on public.friends;
create trigger friends_no_blocked before insert or update on public.friends
  for each row execute function public.refuse_blocked_friend();

-- One-to-one chat stops when either side blocks.
create or replace function public.can_use_thread(t text, uid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  a uuid;
  b uuid;
begin
  if uid is null then return false; end if;
  if t like 'g:%' then
    return public.is_group_member(substr(t, 3)::uuid, uid);
  elsif t like 'd:%' then
    a := split_part(t, ':', 2)::uuid;
    b := split_part(t, ':', 3)::uuid;
    return a < b and (uid = a or uid = b) and public.are_friends(a, b) and not public.is_blocked(a, b);
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mute and pin, per person per chat (on the read-marks row)
-- ---------------------------------------------------------------------------
alter table public.thread_reads add column if not exists muted boolean not null default false;
alter table public.thread_reads add column if not exists pinned boolean not null default false;

-- ---------------------------------------------------------------------------
-- Polls and documents as message kinds
-- ---------------------------------------------------------------------------
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'task', 'poll', 'file'));

create or replace function public.can_see_message(mid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_use_thread(m.thread, uid) from public.messages m where m.id = mid), false);
$$;
revoke all on function public.can_see_message(uuid, uuid) from public, anon;
grant execute on function public.can_see_message(uuid, uuid) to authenticated;

create table if not exists public.poll_votes (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  choice int not null check (choice between 0 and 9),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.poll_votes enable row level security;
drop policy if exists poll_votes_select on public.poll_votes;
create policy poll_votes_select on public.poll_votes for select to authenticated
  using (public.can_see_message(message_id, auth.uid()));
drop policy if exists poll_votes_insert on public.poll_votes;
create policy poll_votes_insert on public.poll_votes for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_message(message_id, auth.uid()));
drop policy if exists poll_votes_update on public.poll_votes;
create policy poll_votes_update on public.poll_votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists poll_votes_delete on public.poll_votes;
create policy poll_votes_delete on public.poll_votes for delete to authenticated
  using (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'poll_votes'
  ) then
    alter publication supabase_realtime add table public.poll_votes;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Documents in chat: private bucket, readable by whoever can read the chat.
-- Path: <thread with ':' as '_'>/<random>/<file name>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_files_read on storage.objects;
create policy chat_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-files'
    and public.can_use_thread(replace((storage.foldername(name))[1], '_', ':'), auth.uid())
  );
drop policy if exists chat_files_write on storage.objects;
create policy chat_files_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and public.can_use_thread(replace((storage.foldername(name))[1], '_', ':'), auth.uid())
  );
drop policy if exists chat_files_delete on storage.objects;
create policy chat_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-files' and owner = (select auth.uid()));
