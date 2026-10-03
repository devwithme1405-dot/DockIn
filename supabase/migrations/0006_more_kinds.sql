-- ---------------------------------------------------------------------------
-- DockIn, migration 6: two more kinds of synced record.
--
--   shareState  what you did with something a friend shared with you
--   categories  your own list of places you spend money
--
-- Both are yours alone and ride on the same sync_records table as everything
-- else; this only widens the list of names it will accept.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

alter table public.sync_records drop constraint if exists sync_records_kind_check;
alter table public.sync_records add constraint sync_records_kind_check
  check (kind in (
    'profile','subjects','slots','sessions','expenses','tasks','events',
    'shareState','categories'
  ));
