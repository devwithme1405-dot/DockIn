-- Chat (one-to-one and group) and push-notification tokens.
--
-- A thread is named by text so one table holds both kinds:
--   'g:<group id>'           — everyone in the group
--   'd:<smaller id>:<larger>' — two friends (ids sorted, so both sides agree)
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread text not null check (thread ~ '^(g:[0-9a-f-]{36}|d:[0-9a-f-]{36}:[0-9a-f-]{36})$'),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  -- 'text', or 'task' (a task card; its fields live in data)
  kind text not null default 'text' check (kind in ('text', 'task')),
  data jsonb,
  reply_to uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists messages_thread_idx on public.messages (thread, created_at desc);
alter table public.messages enable row level security;

-- Who may read and write a thread. SECURITY DEFINER so the policy does not
-- recurse through group_members' own policy.
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
    return a < b and (uid = a or uid = b) and public.are_friends(a, b);
  end if;
  return false;
end;
$$;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.can_use_thread(thread, auth.uid()));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (author = auth.uid() and public.can_use_thread(thread, auth.uid()));

-- Only "delete for everyone" on your own message (sets deleted_at).
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (author = auth.uid()) with check (author = auth.uid());

-- Where each person has read up to, per thread (unread counts, "seen").
create table if not exists public.thread_reads (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  thread text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, thread)
);
alter table public.thread_reads enable row level security;

drop policy if exists thread_reads_select on public.thread_reads;
create policy thread_reads_select on public.thread_reads for select to authenticated
  using (user_id = auth.uid() or public.can_use_thread(thread, auth.uid()));
drop policy if exists thread_reads_write on public.thread_reads;
create policy thread_reads_write on public.thread_reads for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists thread_reads_update on public.thread_reads;
create policy thread_reads_update on public.thread_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Phone tokens for push notifications (Firebase). Only the owner sees theirs;
-- the server sends with the service role.
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Live chat: stream new messages to the phones that may read them (RLS applies).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

revoke all on function public.can_use_thread(text, uuid) from public, anon;
grant execute on function public.can_use_thread(text, uuid) to authenticated;

-- Who in the group has finished a shared task. Your own row only; everyone
-- who can see the task can see the progress on it.
create table if not exists public.share_progress (
  share_id uuid not null references public.shares (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done boolean not null default false,
  submitted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (share_id, user_id)
);
alter table public.share_progress enable row level security;

drop policy if exists share_progress_select on public.share_progress;
create policy share_progress_select on public.share_progress for select to authenticated
  using (public.can_see_share(share_id, auth.uid()));
drop policy if exists share_progress_insert on public.share_progress;
create policy share_progress_insert on public.share_progress for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_share(share_id, auth.uid()));
drop policy if exists share_progress_update on public.share_progress;
create policy share_progress_update on public.share_progress for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
