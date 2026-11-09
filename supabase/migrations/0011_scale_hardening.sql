-- ---------------------------------------------------------------------------
-- DockIn, migration 11: ready for a whole campus at once.
--
-- sync_records is the one table every phone talks to every few minutes. Its
-- policies called is_allowed_email(auth.jwt() ->> 'email') bare, which Postgres
-- evaluates once per row; a pull of 1,000 rows ran it 1,000 times. Wrapped in
-- (select …) it becomes an init-plan: worked out once per query. Same rules,
-- same result, a fraction of the work — this is Supabase's own advice for RLS
-- at scale.
--
-- Also: an index for the "everything of mine of this kind" lookups, and the
-- update policy keeps a user from moving a row to someone else's id.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

drop policy if exists "own rows: select" on public.sync_records;
create policy "own rows: select" on public.sync_records
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.is_allowed_email((select auth.jwt()) ->> 'email'))
  );

drop policy if exists "own rows: insert" on public.sync_records;
create policy "own rows: insert" on public.sync_records
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_allowed_email((select auth.jwt()) ->> 'email'))
  );

drop policy if exists "own rows: update" on public.sync_records;
create policy "own rows: update" on public.sync_records
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.is_allowed_email((select auth.jwt()) ->> 'email'))
  )
  with check (
    user_id = (select auth.uid())
    and (select public.is_allowed_email((select auth.jwt()) ->> 'email'))
  );

drop policy if exists "own rows: delete" on public.sync_records;
create policy "own rows: delete" on public.sync_records
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- The same wrapping for the two social inserts that call it.
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_allowed_email((select auth.jwt()) ->> 'email'))
  );

create index if not exists sync_records_kind_idx on public.sync_records (user_id, kind);

-- One student cannot quietly fill the database: at most 60,000 records each
-- (a busy year is a few thousand). Counted once per upload batch, not per row,
-- so a new phone's first big upload stays fast.
create or replace function public.sync_records_cap()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1
    from (select distinct user_id from inserted) u
    where (select count(*) from public.sync_records r where r.user_id = u.user_id) > 60000
  ) then
    raise exception 'DockIn: this account has reached its storage limit';
  end if;
  return null;
end;
$$;

drop trigger if exists sync_records_cap on public.sync_records;
create trigger sync_records_cap
  after insert on public.sync_records
  referencing new table as inserted
  for each statement execute function public.sync_records_cap();
