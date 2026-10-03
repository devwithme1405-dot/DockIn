-- ---------------------------------------------------------------------------
-- DockIn, migration 8: payments the phone notices.
--
-- Shape of the thing:
--   * The Android app watches notifications from payment apps and banks and
--     forwards them here. It does not understand them — the web app does the
--     reading, so a bank that changes its wording is a deploy rather than an
--     APK everyone has to reinstall.
--   * The phone has no login of its own, and is not asked to get one. It makes
--     a secret for itself on first run and carries it on the address it opens
--     the site with; the signed-in site calls claim_device() and the pairing is
--     done without anybody tapping anything. Only the hash is stored, so a copy
--     of this table does not let anyone post as that phone.
--   * `pay_notices` is an inbox, not a record: rows are deleted once the person
--     has dealt with them, and in any case after a fortnight. The money itself
--     lives in the normal expenses, created only when someone taps to confirm.
--
-- Account and card numbers are stripped on the phone before anything is sent,
-- and again in the app when it reads them.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

alter table public.sync_records drop constraint if exists sync_records_kind_check;
alter table public.sync_records add constraint sync_records_kind_check
  check (kind in (
    'profile','subjects','slots','sessions','expenses','tasks','events',
    'shareState','categories','merchants'
  ));

-- ---------------------------------------------------------------------------
-- 1. A linked phone
-- ---------------------------------------------------------------------------

create table if not exists public.pay_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  label        text check (char_length(label) <= 40),
  created_at   timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz
);

alter table public.pay_devices enable row level security;
create index if not exists pay_devices_user_idx on public.pay_devices (user_id);

-- You can see and unlink your own phones. Nothing inserts through this policy;
-- a device is only ever created by link_payments() below.
drop policy if exists pay_devices_select on public.pay_devices;
create policy pay_devices_select on public.pay_devices for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists pay_devices_delete on public.pay_devices;
create policy pay_devices_delete on public.pay_devices for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. The inbox
-- ---------------------------------------------------------------------------

create table if not exists public.pay_notices (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  app       text not null check (char_length(app) <= 120),
  title     text not null default '' check (char_length(title) <= 200),
  body      text not null default '' check (char_length(body) <= 400),
  posted_at bigint not null,
  seen_at   timestamptz not null default clock_timestamp()
);

alter table public.pay_notices enable row level security;
create index if not exists pay_notices_user_idx on public.pay_notices (user_id, posted_at desc);

drop policy if exists pay_notices_select on public.pay_notices;
create policy pay_notices_select on public.pay_notices for select to authenticated
  using (user_id = (select auth.uid()));

-- Dealing with one — adding it or dismissing it — removes it.
drop policy if exists pay_notices_delete on public.pay_notices;
create policy pay_notices_delete on public.pay_notices for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Linking a phone
-- ---------------------------------------------------------------------------

-- The phone brings its own secret; this is the site, already signed in, saying
-- "that one is mine". Running it again with the same secret changes nothing,
-- which matters because the app passes it on every single launch.
create or replace function public.claim_device(secret text, device_label text default 'Phone')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  me   uuid := auth.uid();
  hash text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if secret is null or char_length(secret) < 24 then raise exception 'bad_secret'; end if;

  hash := encode(sha256(convert_to(secret, 'utf8')), 'hex');

  insert into public.pay_devices (user_id, token_hash, label)
  values (me, hash, left(coalesce(device_label, 'Phone'), 40))
  on conflict (token_hash) do update
    -- A phone belongs to whoever is signed in on it now, so a shared or
    -- handed-down handset follows its owner instead of posting to the last one.
    set user_id = excluded.user_id;
end $$;

revoke all on function public.claim_device(text, text) from public, anon;
grant execute on function public.claim_device(text, text) to authenticated;

drop function if exists public.link_payments(text);

-- ---------------------------------------------------------------------------
-- 4. What the phone calls
-- ---------------------------------------------------------------------------

-- The phone has only its secret, so the secret is the whole of the
-- authentication. It can do exactly one thing: drop a notification into its own
-- owner's inbox. It cannot read anything back. The app reaches this through the
-- site's own /api/notice, so no key or address of this project is in the APK.
create or replace function public.log_notice(
  token text,
  app text,
  title text,
  body text,
  posted_at bigint
)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  owner uuid;
begin
  select d.user_id into owner
  from public.pay_devices d
  where d.token_hash = encode(sha256(convert_to(coalesce(token, ''), 'utf8')), 'hex');

  if owner is null then raise exception 'unknown_device'; end if;

  update public.pay_devices set last_seen_at = clock_timestamp()
   where token_hash = encode(sha256(convert_to(token, 'utf8')), 'hex');

  insert into public.pay_notices (user_id, app, title, body, posted_at)
  values (owner, left(app, 120), left(coalesce(title, ''), 200), left(coalesce(body, ''), 400),
          posted_at);

  -- An inbox nobody empties is a leak, not a feature: anything a fortnight old,
  -- and anything past the newest two hundred, goes.
  delete from public.pay_notices
   where user_id = owner
     and (seen_at < clock_timestamp() - interval '14 days'
          or id not in (
            select id from public.pay_notices
            where user_id = owner order by posted_at desc limit 200
          ));
end $$;

revoke all on function public.log_notice(text, text, text, text, bigint) from public;
grant execute on function public.log_notice(text, text, text, text, bigint) to anon, authenticated;
