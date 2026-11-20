-- Compare with friends: each person may publish a small snapshot of their own
-- numbers (attendance per subject, tasks and deadlines, the coming timetable
-- for the trip planner). Only accepted friends can read it, and only while the
-- owner keeps sharing on — switching it off deletes the row.
create table if not exists public.friend_stats (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.friend_stats enable row level security;

drop policy if exists friend_stats_read on public.friend_stats;
create policy friend_stats_read on public.friend_stats for select to authenticated
  using (
    user_id = (select auth.uid())
    or (public.are_friends((select auth.uid()), user_id) and not public.is_blocked((select auth.uid()), user_id))
  );

drop policy if exists friend_stats_write on public.friend_stats;
create policy friend_stats_write on public.friend_stats for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and pg_column_size(data) < 60000);

-- Live: a friend's numbers update on your screen as they change.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_stats'
  ) then
    alter publication supabase_realtime add table public.friend_stats;
  end if;
end $$;
