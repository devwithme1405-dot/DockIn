-- ---------------------------------------------------------------------------
-- DockIn, migration 10: udhaar and money in.
--
--   dues     lena-dena: who owes you, and whom you owe
--   incomes  money that came in and was not someone paying you back
--
-- Both are yours alone and ride on sync_records like everything else. From
-- here on any short camelCase name is accepted, so a new kind of record never
-- again waits on this file: the row-level policies, not this list, are what
-- keep one person's data from another.
--
-- Until this runs, the app keeps these two on the phone and backs up the rest.
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

alter table public.sync_records drop constraint if exists sync_records_kind_check;
alter table public.sync_records add constraint sync_records_kind_check
  check (kind ~ '^[a-z][A-Za-z]{1,31}$');
