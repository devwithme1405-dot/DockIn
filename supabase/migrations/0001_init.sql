-- DockIn: Bennett-only accounts + cloud sync.
-- Run this whole file once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again; every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1. Who may sign up: Bennett emails, plus a small list of exceptions
-- ---------------------------------------------------------------------------

create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email))
);
-- RLS on with no policies: nobody can read or edit this list through the API.
alter table public.allowed_emails enable row level security;

-- Change the domain here if Bennett's student emails use a different one.
create or replace function public.allowed_domain()
returns text language sql immutable as $$ select 'bennett.edu.in'::text $$;

create or replace function public.is_allowed_email(addr text)
returns boolean
language sql stable security definer set search_path = public as $$
  select addr is not null and (
    lower(addr) like '%@' || public.allowed_domain()
    or exists (select 1 from public.allowed_emails e where e.email = lower(addr))
  );
$$;

revoke all on function public.is_allowed_email(text) from public, anon;
grant execute on function public.is_allowed_email(text) to authenticated;

-- Refuse sign-ups from any other email, whatever the app does.
create or replace function public.block_non_bennett_signup()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_allowed_email(new.email) then
    raise exception 'Only Bennett University email accounts can sign up for DockIn.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists dockin_block_non_bennett on auth.users;
create trigger dockin_block_non_bennett
  before insert on auth.users
  for each row execute function public.block_non_bennett_signup();

-- ---------------------------------------------------------------------------
-- 2. Synced data. One row per record, grouped by `kind`.
--    The app is offline-first: this table mirrors what is on each phone.
-- ---------------------------------------------------------------------------

create table if not exists public.sync_records (
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text   not null check (kind in
               ('profile','subjects','slots','sessions','expenses','tasks','events')),
  id         text   not null check (char_length(id) between 1 and 80),
  updated_at bigint not null,                -- client clock, used to pick the newer edit
  deleted_at bigint,
  data       jsonb  not null check (octet_length(data::text) < 60000),
  synced_at  timestamptz not null default clock_timestamp(), -- server clock, used for pulling
  primary key (user_id, kind, id)
);

create index if not exists sync_records_pull_idx on public.sync_records (user_id, synced_at);

-- Stamp the server time, and never let an older edit overwrite a newer one.
create or replace function public.sync_records_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at <= old.updated_at then
      return old; -- stale or repeated write from a phone: ignore
    end if;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists sync_records_guard on public.sync_records;
create trigger sync_records_guard
  before insert or update on public.sync_records
  for each row execute function public.sync_records_guard();

-- ---------------------------------------------------------------------------
-- 3. Row level security: every student sees only their own rows
-- ---------------------------------------------------------------------------

alter table public.sync_records enable row level security;

revoke all on public.sync_records from anon;
grant select, insert, update, delete on public.sync_records to authenticated;

drop policy if exists "own rows: select" on public.sync_records;
create policy "own rows: select" on public.sync_records
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_allowed_email(auth.jwt() ->> 'email'));

drop policy if exists "own rows: insert" on public.sync_records;
create policy "own rows: insert" on public.sync_records
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_allowed_email(auth.jwt() ->> 'email'));

drop policy if exists "own rows: update" on public.sync_records;
create policy "own rows: update" on public.sync_records
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_allowed_email(auth.jwt() ->> 'email'))
  with check (user_id = (select auth.uid()) and public.is_allowed_email(auth.jwt() ->> 'email'));

drop policy if exists "own rows: delete" on public.sync_records;
create policy "own rows: delete" on public.sync_records
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Your own account (so you can test with a non-Bennett email)
--    Uncomment and put your email, then run again:
-- ---------------------------------------------------------------------------
-- insert into public.allowed_emails (email) values ('motionsachin1@gmail.com')
--   on conflict do nothing;
