-- Practice LMS: a pretend LMS shared by one group, for trying assignment
-- solutions without touching the real LMS. Anyone in the group can add
-- assignments; everyone in the group sees every submission (it is test data),
-- so one member can watch it all from a laptop like a teacher would.
-- Files go in the existing chat-files bucket under g_<group>/practice/…, which
-- its policies already limit to the group's members.

create table if not exists public.practice_assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- What the app uses as the LMS assignment id ("lms-assign-<instance>").
  instance bigint not null check (instance > 900100 and instance <= 999999),
  title text not null check (char_length(title) between 1 and 140),
  course text not null default '' check (char_length(course) <= 80),
  due_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, instance)
);
create index if not exists practice_assignments_group on public.practice_assignments (group_id);
alter table public.practice_assignments enable row level security;

drop policy if exists practice_assignments_read on public.practice_assignments;
create policy practice_assignments_read on public.practice_assignments for select to authenticated
  using (public.is_group_member(group_id, (select auth.uid())));

drop policy if exists practice_assignments_add on public.practice_assignments;
create policy practice_assignments_add on public.practice_assignments for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id, (select auth.uid())));

drop policy if exists practice_assignments_remove on public.practice_assignments;
create policy practice_assignments_remove on public.practice_assignments for delete to authenticated
  using (public.is_group_member(group_id, (select auth.uid())));

create table if not exists public.practice_submissions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  instance bigint not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  size integer not null default 0,
  -- The file in chat-files; null when nothing was kept (failed / refused).
  path text,
  status text not null check (status in ('submitted', 'draft', 'failed', 'refused')),
  created_at timestamptz not null default now()
);
create index if not exists practice_submissions_group on public.practice_submissions (group_id, instance, created_at);
alter table public.practice_submissions enable row level security;

drop policy if exists practice_submissions_read on public.practice_submissions;
create policy practice_submissions_read on public.practice_submissions for select to authenticated
  using (public.is_group_member(group_id, (select auth.uid())));

drop policy if exists practice_submissions_add on public.practice_submissions;
create policy practice_submissions_add on public.practice_submissions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id, (select auth.uid())));

drop policy if exists practice_submissions_clear on public.practice_submissions;
create policy practice_submissions_clear on public.practice_submissions for delete to authenticated
  using (public.is_group_member(group_id, (select auth.uid())));

-- Live: the laptop's teacher view updates the moment a phone submits.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'practice_submissions'
  ) then
    alter publication supabase_realtime add table public.practice_submissions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'practice_assignments'
  ) then
    alter publication supabase_realtime add table public.practice_assignments;
  end if;
end $$;
