-- 0031 · DockIn Admin, the full control room.
--
-- Adds, on top of 0029 (admin) and 0030 (identity):
--   events              what students do in DockIn (outpass, LMS, voice…), sent by
--                       the app through track_events() only — names and small
--                       enums, never free text. Rate-limited per student.
--   broadcast_receipts  per notification and person: when it reached the phone
--                       (signed receipt from the phone) and when it was opened.
--   app_config 'flags'  kill-switches the app obeys live (outpass, self-approval,
--                       LMS submit, voice) — flip a broken feature off without an APK.
--   identity_events     + 'reset' (an admin sent an account back to verify).
-- and admin functions: overview2, live, growth, features, risk (fake/suspicious
-- accounts), user360, users2, health2, export, and actions (force sign-out,
-- identity reset, flags). Every admin_* function refuses non-admins.
--
-- Run once in the Supabase SQL editor (after 0029 and 0030). Safe to re-run.

-- ============================================================== helpers

/** "3.0.57" → {3,0,57}; "3.0-preview.4" → {3,0,0,4}. Same rule as the dashboard. */
create or replace function public.version_key(v text)
returns int[] language sql immutable as $$
  select coalesce(array_agg(coalesce(nullif(regexp_replace(x, '\D', '', 'g'), '')::int, 0) order by o), '{}'::int[])
  from unnest(regexp_split_to_array(coalesce(v, ''), '[.-]')) with ordinality as t(x, o)
$$;

/** Today in India. */
create or replace function public.ist_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

/** The start of an Indian day, as a timestamp. */
create or replace function public.ist_start(d date)
returns timestamptz language sql immutable as $$ select (d::timestamp at time zone 'Asia/Kolkata') $$;

/** Words of a name, lower-case, letters only, 3+ letters (for comparing names). */
create or replace function public.name_words(n text)
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct w), '{}'::text[])
  from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(n, ''), '[^A-Za-z ]', ' ', 'g')), '\s+')) w
  where char_length(w) >= 3
$$;

-- ============================================================== indexes the dashboard leans on

create index if not exists messages_author_at_idx on public.messages (author, created_at desc);
create index if not exists reports_target_idx on public.reports (target, status);
create index if not exists identity_events_user_idx on public.identity_events (user_id);
create index if not exists identity_events_other_idx on public.identity_events (other_user);
create index if not exists client_errors_user_at_idx on public.client_errors (user_id, at desc);
create index if not exists broadcasts_sent_idx on public.broadcasts (sent_at desc);

-- ============================================================== events

create table if not exists public.events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  name text not null check (name ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$' and char_length(name) <= 40),
  props jsonb not null default '{}'::jsonb,
  platform text check (char_length(platform) <= 10),
  version text check (char_length(version) <= 30)
);
create index if not exists events_at_idx on public.events (at desc);
create index if not exists events_name_at_idx on public.events (name, at desc);
create index if not exists events_user_at_idx on public.events (user_id, at desc);
alter table public.events enable row level security;
-- No policies: students write only through track_events(), admins read only through admin_* functions.

/**
 * The app's batch of events. Each: {name, at?, props?}. `at` from the phone is
 * kept only if it is within the last 3 days (an offline queue), else now. Props
 * keep only short scalar values. At most 50 per call and 600 per student per
 * hour — anything beyond is dropped, never an error the app has to handle.
 */
create or replace function public.track_events(p_events jsonb, p_platform text default null, p_version text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  e jsonb;
  kept int := 0;
  room int;
  t timestamptz;
  props jsonb;
  k text;
  v jsonb;
begin
  if me is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  select 600 - count(*) into room from public.events where user_id = me and at > now() - interval '1 hour';
  room := least(room, 50);
  for e in select * from jsonb_array_elements(p_events) loop
    exit when kept >= room;
    continue when jsonb_typeof(e) <> 'object';
    continue when coalesce(e->>'name', '') !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$' or char_length(e->>'name') > 40;
    begin
      t := (e->>'at')::timestamptz;
    exception when others then
      t := null;
    end;
    if t is null or t > now() + interval '5 minutes' or t < now() - interval '3 days' then t := now(); end if;
    props := '{}'::jsonb;
    if jsonb_typeof(e->'props') = 'object' then
      for k, v in select * from jsonb_each(e->'props') loop
        exit when (select count(*) from jsonb_object_keys(props)) >= 8;
        continue when char_length(k) > 24;
        if jsonb_typeof(v) in ('boolean', 'number') then
          props := props || jsonb_build_object(k, v);
        elsif jsonb_typeof(v) = 'string' then
          props := props || jsonb_build_object(k, left(v #>> '{}', 40));
        end if;
      end loop;
    end if;
    insert into public.events (user_id, at, name, props, platform, version)
    values (me, t, e->>'name', props, left(p_platform, 10), left(p_version, 30));
    kept := kept + 1;
  end loop;
  return kept;
end $$;
revoke all on function public.track_events(jsonb, text, text) from public, anon;
grant execute on function public.track_events(jsonb, text, text) to authenticated;

-- ============================================================== notification receipts

alter table public.broadcasts add column if not exists targeted int not null default 0;
alter table public.broadcasts add column if not exists instant int not null default 0;
alter table public.broadcasts add column if not exists failed int not null default 0;

create table if not exists public.broadcast_receipts (
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  delivered_at timestamptz,
  opened_at timestamptz,
  primary key (broadcast_id, user_id)
);
create index if not exists broadcast_receipts_user_idx on public.broadcast_receipts (user_id);
alter table public.broadcast_receipts enable row level security;

/** The phone said it got it (signed receipt checked by /api/delivered). Server only. */
create or replace function public.broadcast_delivered_for(p_broadcast uuid, p_user uuid, p_at timestamptz)
returns void language sql security definer set search_path = public as $$
  insert into public.broadcast_receipts (broadcast_id, user_id, delivered_at)
  select p_broadcast, p_user, least(p_at, now())
  where exists (select 1 from public.broadcasts where id = p_broadcast)
  on conflict (broadcast_id, user_id) do update
    set delivered_at = coalesce(public.broadcast_receipts.delivered_at, excluded.delivered_at);
$$;
revoke all on function public.broadcast_delivered_for(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.broadcast_delivered_for(uuid, uuid, timestamptz) to service_role;

/** A student opened DockIn from a notification. Opening also proves it arrived. */
create or replace function public.broadcast_opened(p_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.broadcast_receipts (broadcast_id, user_id, delivered_at, opened_at)
  select p_id, auth.uid(), now(), now()
  where auth.uid() is not null
    and exists (select 1 from public.broadcasts where id = p_id and sent_at > now() - interval '30 days')
  on conflict (broadcast_id, user_id) do update
    set opened_at = coalesce(public.broadcast_receipts.opened_at, now()),
        delivered_at = coalesce(public.broadcast_receipts.delivered_at, now());
$$;
revoke all on function public.broadcast_opened(uuid) from public, anon;
grant execute on function public.broadcast_opened(uuid) to authenticated;

-- ============================================================== flags + identity reset kind

alter table public.app_config drop constraint if exists app_config_key_check;
alter table public.app_config add constraint app_config_key_check check (key in ('announcement', 'flags'));

alter table public.identity_events drop constraint if exists identity_events_kind_check;
alter table public.identity_events add constraint identity_events_kind_check
  check (kind in ('verified', 'renamed_holder', 'conflict', 'already_linked', 'reset'));

/** Kill-switches: {outpass, self_approval, lms_submit, voice} → true/false. Owner only. */
create or replace function public.admin_set_flags(p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare clean jsonb := '{}'::jsonb; k text;
begin
  perform public.assert_admin(true);
  foreach k in array array['outpass', 'self_approval', 'lms_submit', 'voice'] loop
    if jsonb_typeof(p_value->k) = 'boolean' then clean := clean || jsonb_build_object(k, p_value->k); end if;
  end loop;
  insert into public.app_config (key, value, updated_at) values ('flags', clean, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.audit('flags.set', null, clean);
  return clean;
end $$;
grant execute on function public.admin_set_flags(jsonb) to authenticated;

-- ============================================================== risk (fake / suspicious accounts)

/**
 * Why an account looks off, each reason with its weight. Plain facts from the
 * database, nothing guessed:
 *   name_mismatch    the profile name shares no word with the name MyCamu has for
 *                    the enrollment it verified with (someone else's MyCamu)
 *   link_attempt     tried to verify with a MyCamu already tied to another account,
 *                    or with an enrollment another MyCamu holds
 *   unverified       never confirmed with MyCamu (older than a day)
 *   username_mismatch verified, but the username is not that enrollment
 *   year_mismatch    the year of study is 2+ off what the enrollment's batch says
 *   reported         reported by other students (open reports, per reporter)
 *   spam             60+ messages in an hour or 400+ in a day
 *   banned_before    was suspended earlier
 *   ghost            signed up 3+ days ago and never opened the app
 */
create or replace function public.risk_signals(uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  out jsonb := '[]'::jsonb;
  u record;
  idn record;
  prof record;
  seen_at timestamptz;
  n int;
  batch int;
  expected int;
  pw text[];
  cw text[];
begin
  select id, split_part(email, '@', 1) as username, created_at into u from auth.users where id = uid;
  if u.id is null then return out; end if;
  select enrollment, camu_name into idn from public.identities where user_id = uid;
  select name, year into prof from public.profiles where user_id = uid;
  select last_seen into seen_at from public.user_seen where user_id = uid;

  if idn.enrollment is not null and coalesce(idn.camu_name, '') <> '' and coalesce(prof.name, '') <> '' then
    pw := public.name_words(prof.name);
    cw := public.name_words(idn.camu_name);
    if cardinality(pw) > 0 and cardinality(cw) > 0 and not (pw && cw) then
      out := out || jsonb_build_object('id', 'name_mismatch', 'w', 35,
        'text', format('Profile says "%s" but MyCamu says %s is "%s"', prof.name, idn.enrollment, idn.camu_name));
    end if;
  end if;

  select count(*) into n from public.identity_events where user_id = uid and kind in ('already_linked', 'conflict');
  if n > 0 then
    out := out || jsonb_build_object('id', 'link_attempt', 'w', 40,
      'text', format('Tried to verify with someone else''s MyCamu or enrollment %s time%s', n, case when n = 1 then '' else 's' end));
  end if;

  if idn.enrollment is null and u.created_at < now() - interval '1 day' then
    out := out || jsonb_build_object('id', 'unverified', 'w', 20, 'text', 'Never confirmed with MyCamu');
  end if;

  if idn.enrollment is not null and lower(u.username) <> lower(idn.enrollment) then
    out := out || jsonb_build_object('id', 'username_mismatch', 'w', 15,
      'text', format('Verified as %s but the username is %s', idn.enrollment, u.username));
  end if;

  if idn.enrollment is not null and prof.year is not null then
    batch := nullif(substring(idn.enrollment from '^[A-Z]{1,2}([0-9]{2})'), '')::int;
    if batch is not null then
      expected := (extract(year from public.ist_today())::int - 2000) - batch
                  + case when extract(month from public.ist_today()) >= 7 then 1 else 0 end;
      if abs(prof.year - expected) >= 2 then
        out := out || jsonb_build_object('id', 'year_mismatch', 'w', 10,
          'text', format('Says year %s, but batch 20%s should be in year %s', prof.year, lpad(batch::text, 2, '0'), expected));
      end if;
    end if;
  end if;

  select count(distinct reporter) into n from public.reports where target = uid and status = 'open';
  if n > 0 then
    out := out || jsonb_build_object('id', 'reported', 'w', least(45, 15 * n),
      'text', format('Reported by %s student%s (open)', n, case when n = 1 then '' else 's' end));
  end if;

  if (select count(*) from public.messages where author = uid and created_at > now() - interval '1 hour') >= 60
     or (select count(*) from public.messages where author = uid and created_at > now() - interval '1 day') >= 400 then
    out := out || jsonb_build_object('id', 'spam', 'w', 25, 'text', 'Sending messages unusually fast');
  end if;

  if exists (select 1 from public.bans where user_id = uid and until is not null and until <= now()) then
    out := out || jsonb_build_object('id', 'banned_before', 'w', 10, 'text', 'Was suspended before');
  end if;

  if seen_at is null and u.created_at < now() - interval '3 days' then
    out := out || jsonb_build_object('id', 'ghost', 'w', 5, 'text', 'Signed up but never opened the app');
  end if;

  return out;
end $$;
revoke all on function public.risk_signals(uuid) from public, anon, authenticated;

create or replace function public.risk_score(signals jsonb)
returns int language sql immutable as $$
  select coalesce(sum((s->>'w')::int), 0)::int from jsonb_array_elements(coalesce(signals, '[]'::jsonb)) s
$$;

/** Every account with at least one signal, worst first, plus how many have each. */
create or replace function public.admin_risk(p_min int default 1, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  perform public.assert_admin();
  with scored as (
    select u.id, split_part(u.email, '@', 1) as username, u.created_at,
           coalesce(p.name, '') as name, i.enrollment, i.camu_name, s.last_seen, s.platform, s.app_version,
           public.risk_signals(u.id) as signals,
           exists (select 1 from public.bans b where b.user_id = u.id and (b.until is null or b.until > now())) as banned
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.identities i on i.user_id = u.id
    left join public.user_seen s on s.user_id = u.id
  ), ranked as (
    select *, public.risk_score(signals) as score from scored
  )
  select jsonb_build_object(
    'checked', (select count(*) from ranked),
    'flagged', (select count(*) from ranked where score >= greatest(p_min, 1)),
    'high', (select count(*) from ranked where score >= 50),
    'medium', (select count(*) from ranked where score >= 25 and score < 50),
    'by_signal', (
      select coalesce(jsonb_object_agg(sid, n), '{}'::jsonb) from (
        select s->>'id' as sid, count(*) as n from ranked, jsonb_array_elements(signals) s group by 1) x),
    'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, username, name, enrollment, camu_name, created_at, last_seen, platform, app_version, banned, score, signals
      from ranked where score >= greatest(p_min, 1)
      order by score desc, last_seen desc nulls last
      limit least(greatest(p_limit, 1), 500)) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_risk(int, int) to authenticated;

-- ============================================================== overview

create or replace function public.admin_overview2()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  today date := public.ist_today();
  t0 timestamptz := public.ist_start(today);
  y0 timestamptz := public.ist_start(today - 1);
  tracked date := (select min(day) from public.user_days);
  latest int[];
  r jsonb;
begin
  perform public.assert_admin();
  select max(public.version_key(app_version)) into latest
  from public.user_seen where platform = 'android' and coalesce(channel, 'stable') <> 'preview' and app_version is not null;

  select jsonb_build_object(
    'at', now(),
    'tracking_since', tracked,
    'users', (select count(*) from auth.users),
    'verified', (select count(*) from public.identities),
    'profiles', (select count(*) from public.profiles where name <> ''),
    'banned', (select count(*) from public.bans where until is null or until > now()),
    'online_5m', (select count(*) from public.user_seen where last_seen > now() - interval '5 minutes'),
    'online_1h', (select count(*) from public.user_seen where last_seen > now() - interval '1 hour'),
    'signups_today', (select count(*) from auth.users where created_at >= t0),
    'signups_yday_sofar', (select count(*) from auth.users where created_at >= y0 and created_at < now() - interval '1 day'),
    'signups_yday', (select count(*) from auth.users where created_at >= y0 and created_at < t0),
    'signups_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'signups_prev7d', (select count(*) from auth.users where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
    'dau', (select count(*) from public.user_days where day = today),
    'dau_yday', (select count(*) from public.user_days where day = today - 1),
    'wau', (select count(distinct user_id) from public.user_days where day > today - 7),
    'wau_prev', (select count(distinct user_id) from public.user_days where day > today - 14 and day <= today - 7),
    'mau', (select count(distinct user_id) from public.user_days where day > today - 30),
    'avg_dau_30', (select round(count(*)::numeric / 30, 1) from public.user_days where day > today - 30),
    'seen', (select count(*) from public.user_seen),
    'android', (select count(*) from public.user_seen where platform = 'android'),
    'web', (select count(*) from public.user_seen where platform = 'web'),
    'preview', (select count(*) from public.user_seen where channel = 'preview'),
    'camu', (select count(*) from public.user_seen where camu),
    'lms', (select count(*) from public.user_seen where lms),
    'notif_on', (select count(*) from public.user_seen where notifications = 'granted'),
    'push', (select count(distinct user_id) from public.push_tokens),
    'push_instant', (select count(distinct user_id) from public.push_tokens where caps like '%data1%'),
    'messages_today', (select count(*) from public.messages where created_at >= t0),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days'),
    'events_today', (select count(*) from public.events where at >= t0),
    'outpass_7d', (select count(*) from public.events where name = 'outpass.made' and at > now() - interval '7 days'),
    'outpass_users_7d', (select count(distinct user_id) from public.events where name like 'outpass.%' and at > now() - interval '7 days'),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'errors_24h', (select count(*) from public.client_errors where at > now() - interval '1 day'),
    'errors_prev24h', (select count(*) from public.client_errors where at > now() - interval '2 days' and at <= now() - interval '1 day'),
    'error_users_24h', (select count(distinct user_id) from public.client_errors where at > now() - interval '1 day'),
    'active_24h', (select count(*) from public.user_seen where last_seen > now() - interval '1 day'),
    'identity_issues_7d', (select count(*) from public.identity_events where kind in ('conflict', 'already_linked') and at > now() - interval '7 days'),
    'downloads_7d', (select count(*) from public.downloads where at > now() - interval '7 days'),
    'latest_version', (select app_version from public.user_seen
                       where platform = 'android' and coalesce(channel, 'stable') <> 'preview' and public.version_key(app_version) = latest limit 1),
    'on_latest', (select count(*) from public.user_seen
                  where platform = 'android' and coalesce(channel, 'stable') <> 'preview' and public.version_key(app_version) = latest
                    and last_seen > now() - interval '30 days'),
    'android_30d', (select count(*) from public.user_seen
                    where platform = 'android' and coalesce(channel, 'stable') <> 'preview' and last_seen > now() - interval '30 days'),
    'versions', (
      select coalesce(jsonb_agg(jsonb_build_object('v', v, 'n', n) order by n desc), '[]'::jsonb)
      from (select coalesce(app_version, '?') v, count(*) n from public.user_seen
            where last_seen > now() - interval '30 days' group by 1 order by 2 desc limit 10) x),
    'series', (
      with days as (select today - g as d from generate_series(0, 29) g),
      su as (select (created_at at time zone 'Asia/Kolkata')::date d, count(*) n from auth.users
             where created_at >= public.ist_start(today - 29) group by 1),
      ac as (select day d, count(*) n from public.user_days where day > today - 30 group by 1),
      na as (select ud.day d, count(*) n from public.user_days ud join auth.users u on u.id = ud.user_id
             where ud.day > today - 30 and (u.created_at at time zone 'Asia/Kolkata')::date = ud.day group by 1),
      ms as (select (created_at at time zone 'Asia/Kolkata')::date d, count(*) n from public.messages
             where created_at >= public.ist_start(today - 29) group by 1),
      op as (select (at at time zone 'Asia/Kolkata')::date d, count(*) n from public.events
             where name = 'outpass.made' and at >= public.ist_start(today - 29) group by 1),
      er as (select (at at time zone 'Asia/Kolkata')::date d, count(*) n from public.client_errors
             where at >= public.ist_start(today - 29) group by 1)
      select jsonb_agg(jsonb_build_object(
        'd', days.d,
        'signups', coalesce(su.n, 0), 'active', coalesce(ac.n, 0), 'new_active', coalesce(na.n, 0),
        'messages', coalesce(ms.n, 0), 'outpass', coalesce(op.n, 0), 'errors', coalesce(er.n, 0)) order by days.d)
      from days
      left join su on su.d = days.d left join ac on ac.d = days.d left join na on na.d = days.d
      left join ms on ms.d = days.d left join op on op.d = days.d left join er on er.d = days.d)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_overview2() to authenticated;

-- ============================================================== live

/** Who is in DockIn right now, and everything that just happened, newest first. */
create or replace function public.admin_live(p_limit int default 80)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  perform public.assert_admin();
  with feed as (
    select u.created_at as at, 'signup' as kind, u.id as user_id, null::text as title, null::jsonb as detail
      from auth.users u where u.created_at > now() - interval '7 days'
    union all
    select s.last_seen, 'open', s.user_id, s.platform, jsonb_build_object('version', s.app_version)
      from public.user_seen s where s.last_seen > now() - interval '1 day'
    union all
    select e.at, 'event', e.user_id, e.name, e.props
      from public.events e where e.at > now() - interval '2 days'
    union all
    select ce.at, 'error', ce.user_id, ce.message, jsonb_build_object('source', ce.source, 'version', ce.version)
      from public.client_errors ce where ce.at > now() - interval '2 days'
    union all
    select rp.created_at, 'report', rp.target, rp.reason, jsonb_build_object('status', rp.status)
      from public.reports rp where rp.created_at > now() - interval '7 days'
    union all
    select ie.at, 'identity', ie.user_id, ie.kind, jsonb_build_object('enrollment', ie.enrollment)
      from public.identity_events ie where ie.at > now() - interval '7 days'
    union all
    select b.sent_at, 'broadcast', b.sent_by, b.title, jsonb_build_object('people', b.people, 'phones', b.phones)
      from public.broadcasts b where b.sent_at > now() - interval '7 days'
  ), top as (
    select * from feed order by at desc limit least(greatest(p_limit, 1), 300)
  )
  select jsonb_build_object(
    'at', now(),
    'online', coalesce((select jsonb_agg(to_jsonb(o) order by o.last_seen desc) from (
      select s.user_id, s.last_seen, s.platform, s.app_version, coalesce(p.name, '') as name, split_part(u.email, '@', 1) as username
      from public.user_seen s join auth.users u on u.id = s.user_id left join public.profiles p on p.user_id = s.user_id
      where s.last_seen > now() - interval '5 minutes' order by s.last_seen desc limit 100) o), '[]'::jsonb),
    'feed', coalesce((select jsonb_agg(jsonb_build_object(
        'at', t.at, 'kind', t.kind, 'title', t.title, 'detail', t.detail, 'user_id', t.user_id,
        'name', coalesce(p.name, ''), 'username', split_part(u.email, '@', 1)) order by t.at desc)
      from top t left join auth.users u on u.id = t.user_id left join public.profiles p on p.user_id = t.user_id), '[]'::jsonb)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_live(int) to authenticated;

-- ============================================================== growth

/**
 * Funnel, weekly retention cohorts, early return rates and this week's churn.
 * Retention only counts students who joined after DockIn began recording daily
 * opens (tracking_since) — before that the days simply were not written down.
 */
create or replace function public.admin_growth(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  today date := public.ist_today();
  tracked date := (select min(day) from public.user_days);
  wk date := date_trunc('week', today)::date;
  r jsonb;
begin
  perform public.assert_admin();
  with cohort as (
    select u.id, (u.created_at at time zone 'Asia/Kolkata')::date as joined
    from auth.users u
    where p_days <= 0 or u.created_at > now() - make_interval(days => p_days)
  ), steps as (
    select
      count(*) as signed_up,
      count(*) filter (where exists (select 1 from public.profiles p where p.user_id = c.id and p.name <> '')) as named,
      count(*) filter (where exists (select 1 from public.identities i where i.user_id = c.id)) as verified,
      count(*) filter (where exists (select 1 from public.user_seen s where s.user_id = c.id and s.camu)) as camu,
      count(*) filter (where exists (select 1 from public.push_tokens t where t.user_id = c.id)) as notif,
      count(*) filter (where exists (select 1 from public.events e where e.user_id = c.id and e.name like 'outpass.%')) as outpass,
      count(*) filter (where exists (select 1 from public.user_days d where d.user_id = c.id and d.day > today - 7)) as active7
    from cohort c
  ), weeks as (
    select (wk - 7 * g)::date as w from generate_series(0, 7) g
  ), cohorts as (
    select w.w,
      (select count(*) from auth.users u where date_trunc('week', (u.created_at at time zone 'Asia/Kolkata'))::date = w.w) as size,
      (select jsonb_agg(
         case when w.w + 7 * k > today then null else
           (select count(distinct d.user_id) from public.user_days d
              join auth.users u on u.id = d.user_id
             where date_trunc('week', (u.created_at at time zone 'Asia/Kolkata'))::date = w.w
               and d.day between w.w + 7 * k and w.w + 7 * k + 6)
         end order by k)
       from generate_series(0, 7) k) as active
    from weeks w
    where tracked is not null and w.w >= date_trunc('week', tracked)::date
  ), early as (
    select u.id, (u.created_at at time zone 'Asia/Kolkata')::date as joined
    from auth.users u
    where tracked is not null and (u.created_at at time zone 'Asia/Kolkata')::date >= tracked
      and u.created_at > now() - interval '90 days'
  ), ret as (
    select
      count(*) filter (where joined <= today - 2) as d1_n,
      count(*) filter (where joined <= today - 2 and exists (select 1 from public.user_days d where d.user_id = e.id and d.day = e.joined + 1)) as d1,
      count(*) filter (where joined <= today - 8) as w1_n,
      count(*) filter (where joined <= today - 8 and exists (select 1 from public.user_days d where d.user_id = e.id and d.day between e.joined + 1 and e.joined + 7)) as w1,
      count(*) filter (where joined <= today - 31) as m1_n,
      count(*) filter (where joined <= today - 31 and exists (select 1 from public.user_days d where d.user_id = e.id and d.day between e.joined + 22 and e.joined + 30)) as m1
    from early e
  ), this_w as (
    select distinct user_id from public.user_days where day > today - 7
  ), last_w as (
    select distinct user_id from public.user_days where day > today - 14 and day <= today - 7
  ), churn as (
    select
      (select count(*) from this_w) as active,
      (select count(*) from this_w t where exists (select 1 from last_w l where l.user_id = t.user_id)) as retained,
      (select count(*) from last_w l where not exists (select 1 from this_w t where t.user_id = l.user_id)) as churned,
      (select count(*) from this_w t join auth.users u on u.id = t.user_id
         where u.created_at > now() - interval '7 days') as new_users,
      (select count(*) from this_w t join auth.users u on u.id = t.user_id
         where u.created_at <= now() - interval '7 days'
           and not exists (select 1 from last_w l where l.user_id = t.user_id)) as resurrected
  )
  select jsonb_build_object(
    'days', p_days,
    'tracking_since', tracked,
    'funnel', (select to_jsonb(steps) from steps),
    'cohorts', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'size', size, 'active', active) order by w desc) from cohorts), '[]'::jsonb),
    'returns', (select to_jsonb(ret) from ret),
    'churn', (select to_jsonb(churn) from churn)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_growth(int) to authenticated;

-- ============================================================== features

create or replace function public.admin_features(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  today date := public.ist_today();
  r jsonb;
begin
  perform public.assert_admin();
  with ev as (
    select * from public.events where at > since
  ), names as (
    select name, count(*) as n, count(distinct user_id) as users, max(at) as last_at
    from ev group by name
  ), top as (
    select name from names order by n desc limit 6
  )
  select jsonb_build_object(
    'days', p_days,
    'total', (select count(*) from ev),
    'users', (select count(distinct user_id) from ev),
    'names', coalesce((select jsonb_agg(to_jsonb(names) order by n desc) from names), '[]'::jsonb),
    'series', coalesce((
      with per as (
        select name, (at at time zone 'Asia/Kolkata')::date d, count(*) n from ev
        where name in (select name from top) and at >= public.ist_start(today - 13) group by 1, 2)
      select jsonb_agg(jsonb_build_object('name', t.name, 'points', (
        select jsonb_agg(coalesce((select n from per where per.name = t.name and per.d = today - g), 0) order by g desc)
        from generate_series(0, 13) g)) order by (select n from names where names.name = t.name) desc)
      from top t), '[]'::jsonb),
    'outpass', (select jsonb_build_object(
        'made', count(*) filter (where name = 'outpass.made'),
        'dayout', count(*) filter (where name = 'outpass.made' and props->>'kind' = 'dayout'),
        'leave', count(*) filter (where name = 'outpass.made' and props->>'kind' = 'leave'),
        'direct', count(*) filter (where name = 'outpass.made' and props->>'via' = 'direct'),
        'local', count(*) filter (where name = 'outpass.made' and props->>'via' = 'local'),
        'sent_ok', count(*) filter (where name = 'outpass.sent' and props->>'ok' = 'true'),
        'sent_fail', count(*) filter (where name = 'outpass.sent' and coalesce(props->>'ok', 'false') <> 'true'),
        'approved_ok', count(*) filter (where name = 'outpass.approve' and props->>'ok' = 'true'),
        'approved_fail', count(*) filter (where name = 'outpass.approve' and coalesce(props->>'ok', 'false') <> 'true'),
        'cancelled', count(*) filter (where name = 'outpass.cancel' and coalesce(props->>'ok', 'true') = 'true'),
        'voice', count(*) filter (where name = 'outpass.voice'),
        'mail', count(*) filter (where name = 'outpass.mail'),
        'users', count(distinct user_id) filter (where name like 'outpass.%'),
        'fail_codes', coalesce((select jsonb_object_agg(c, n) from (
            select coalesce(props->>'code', '?') c, count(*) n from ev
            where name = 'outpass.sent' and coalesce(props->>'ok', 'false') <> 'true' group by 1 order by 2 desc limit 8) x), '{}'::jsonb))
      from ev where name like 'outpass.%'),
    'lms', (select jsonb_build_object(
        'ok', count(*) filter (where props->>'ok' = 'true'),
        'fail', count(*) filter (where coalesce(props->>'ok', 'false') <> 'true'),
        'users', count(distinct user_id),
        'reasons', coalesce((select jsonb_object_agg(c, n) from (
            select coalesce(props->>'reason', '?') c, count(*) n from ev
            where name = 'lms.submit' and coalesce(props->>'ok', 'false') <> 'true' group by 1 order by 2 desc limit 8) x), '{}'::jsonb))
      from ev where name = 'lms.submit'),
    'notifications', jsonb_build_object(
      'sent', (select count(*) from public.broadcasts where sent_at > since),
      'targeted', (select coalesce(sum(people), 0) from public.broadcasts where sent_at > since),
      'delivered', (select count(*) from public.broadcast_receipts br join public.broadcasts b on b.id = br.broadcast_id
                    where b.sent_at > since and br.delivered_at is not null),
      'opened', (select count(*) from public.broadcast_receipts br join public.broadcasts b on b.id = br.broadcast_id
                 where b.sent_at > since and br.opened_at is not null)
    )
  ) into r;
  return r;
end $$;
grant execute on function public.admin_features(int) to authenticated;

-- ============================================================== students

create or replace function public.admin_users2(
  p_q text default '', p_filter text default 'all', p_sort text default 'recent', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  r jsonb;
  q text := lower(coalesce(trim(p_q), ''));
  latest int[];
begin
  perform public.assert_admin();
  select max(public.version_key(app_version)) into latest
  from public.user_seen where platform = 'android' and coalesce(channel, 'stable') <> 'preview' and app_version is not null;
  with base as (
    select
      u.id, split_part(u.email, '@', 1) as username, u.created_at, u.last_sign_in_at,
      coalesce(p.name, '') as name, p.code, p.branch, p.year, p.section, p.avatar,
      i.enrollment, i.camu_name, i.verified_at,
      s.last_seen, s.first_seen, s.opens, s.platform, s.app_version, s.channel, s.camu, s.lms, s.notifications,
      exists (select 1 from public.push_tokens t where t.user_id = u.id) as push,
      exists (select 1 from public.push_tokens t where t.user_id = u.id and t.caps like '%data1%') as push_instant,
      (select count(*) from public.reports rp where rp.target = u.id and rp.status = 'open') as reports,
      b.reason as ban_reason, b.until as ban_until,
      (b.user_id is not null and (b.until is null or b.until > now())) as banned,
      (s.platform = 'android' and coalesce(s.channel, 'stable') <> 'preview' and s.app_version is not null
        and latest is not null and public.version_key(s.app_version) < latest) as outdated
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.identities i on i.user_id = u.id
    left join public.user_seen s on s.user_id = u.id
    left join public.bans b on b.user_id = u.id
  ), picked as (
    select * from base
    where (q = '' or lower(username) like '%' || q || '%' or lower(name) like '%' || q || '%'
           or lower(coalesce(code, '')) like '%' || q || '%' or lower(coalesce(enrollment, '')) like '%' || q || '%'
           or lower(coalesce(camu_name, '')) like '%' || q || '%' or id::text = q)
      and case p_filter
        when 'online' then last_seen > now() - interval '5 minutes'
        when 'active' then last_seen > now() - interval '7 days'
        when 'inactive' then last_seen is null or last_seen < now() - interval '7 days'
        when 'new' then created_at > now() - interval '7 days'
        when 'android' then platform = 'android'
        when 'web' then platform = 'web'
        when 'verified' then enrollment is not null
        when 'unverified' then enrollment is null
        when 'no_camu' then camu is not true
        when 'no_push' then not push
        when 'outdated' then outdated
        when 'reported' then reports > 0
        when 'banned' then banned
        when 'risky' then public.risk_score(public.risk_signals(id)) >= 25
        else true end
  ), ordered as (
    select picked.*, row_number() over (
      order by
        case when p_sort = 'name' then lower(name) end asc nulls last,
        case when p_sort = 'joined' then created_at end desc nulls last,
        case when p_sort = 'opens' then opens end desc nulls last,
        coalesce(last_seen, created_at) desc,
        id) as ord
    from picked
  ), page as (
    select * from ordered
    where ord > greatest(p_offset, 0) and ord <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 200)
  )
  select jsonb_build_object(
    'total', (select count(*) from picked),
    'latest_version', (select app_version from public.user_seen where public.version_key(app_version) = latest limit 1),
    'rows', coalesce((select jsonb_agg((to_jsonb(x) - 'ord') || jsonb_build_object('risk', public.risk_score(public.risk_signals(x.id))) order by x.ord)
      from page x), '[]'::jsonb)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_users2(text, text, text, int, int) to authenticated;

/** Everything about one student: account, identity, devices, activity, events, risk, moderation. */
create or replace function public.admin_user360(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb; today date := public.ist_today(); sig jsonb;
begin
  perform public.assert_admin();
  sig := public.risk_signals(p_id);
  select jsonb_build_object(
    'user', (select to_jsonb(x) from (select u.id, split_part(u.email, '@', 1) as username, u.created_at, u.last_sign_in_at
                                      from auth.users u where u.id = p_id) x),
    'profile', (select to_jsonb(p) - 'share_attendance' from public.profiles p where p.user_id = p_id),
    'identity', (select to_jsonb(i) from public.identities i where i.user_id = p_id),
    'identity_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.at desc) from (
        select at, kind, enrollment, detail from public.identity_events
        where user_id = p_id or other_user = p_id order by at desc limit 20) e), '[]'::jsonb),
    'seen', (select to_jsonb(s) from public.user_seen s where s.user_id = p_id),
    'days', (select coalesce(jsonb_agg(day order by day), '[]'::jsonb) from public.user_days where user_id = p_id and day > today - 84),
    'active_days_30', (select count(*) from public.user_days where user_id = p_id and day > today - 30),
    'phones', (select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'caps', caps, 'updated_at', updated_at) order by updated_at desc), '[]'::jsonb)
               from public.push_tokens where user_id = p_id),
    'sessions', (select count(*) from auth.sessions where user_id = p_id),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.at desc) from (
        select at, name, props, platform, version from public.events where user_id = p_id order by at desc limit 60) e), '[]'::jsonb),
    'event_counts', coalesce((select jsonb_object_agg(name, n) from (
        select name, count(*) n from public.events where user_id = p_id group by name) x), '{}'::jsonb),
    'notifications', jsonb_build_object(
      'delivered', (select count(*) from public.broadcast_receipts where user_id = p_id and delivered_at is not null),
      'opened', (select count(*) from public.broadcast_receipts where user_id = p_id and opened_at is not null)),
    'messages', (select count(*) from public.messages where author = p_id),
    'messages_7d', (select count(*) from public.messages where author = p_id and created_at > now() - interval '7 days'),
    'friends', (select count(*) from public.friends f where f.status = 'accepted' and (f.a = p_id or f.b = p_id)),
    'groups', (select count(*) from public.group_members where user_id = p_id),
    'ban', (select to_jsonb(b) from public.bans b where b.user_id = p_id),
    'reports', coalesce((select jsonb_agg(to_jsonb(rp) order by rp.created_at desc) from (
      select id, reason, excerpt, status, created_at from public.reports where target = p_id order by created_at desc limit 20) rp), '[]'::jsonb),
    'reported_others', (select count(*) from public.reports where reporter = p_id),
    'errors', coalesce((select jsonb_agg(to_jsonb(ce) order by ce.at desc) from (
      select at, message, source, version from public.client_errors where user_id = p_id order by at desc limit 15) ce), '[]'::jsonb),
    'admin', (select role from public.admins where user_id = p_id),
    'risk', jsonb_build_object('score', public.risk_score(sig), 'signals', sig)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_user360(uuid) to authenticated;

/** Compact rows for a CSV of every student (owner only). */
create or replace function public.admin_export_users()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.assert_admin(true);
  perform public.audit('export.users', null, null);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (
    select split_part(u.email, '@', 1) as username, coalesce(p.name, '') as name, i.enrollment, i.camu_name,
           p.branch, p.year, p.section, u.created_at, s.last_seen, s.opens, s.platform, s.app_version,
           s.camu, s.lms, s.notifications,
           exists (select 1 from public.push_tokens t where t.user_id = u.id) as push,
           exists (select 1 from public.bans b where b.user_id = u.id and (b.until is null or b.until > now())) as banned
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.identities i on i.user_id = u.id
    left join public.user_seen s on s.user_id = u.id
    limit 20000) x), '[]'::jsonb);
end $$;
grant execute on function public.admin_export_users() to authenticated;

-- ============================================================== health

create or replace function public.admin_health2()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'errors', coalesce((select jsonb_agg(to_jsonb(x) order by x.n24 desc, x.n desc) from (
      select message, count(*) as n,
        count(*) filter (where at > now() - interval '1 day') as n24,
        count(*) filter (where at > now() - interval '2 days' and at <= now() - interval '1 day') as nprev,
        count(distinct user_id) as people, max(at) as last_at, min(at) as first_at,
        (array_agg(source order by at desc))[1] as source,
        (array_agg(version order by at desc))[1] as version,
        (select coalesce(jsonb_agg(v), '[]'::jsonb) from (select distinct version v from public.client_errors c2
                                                          where c2.message = ce.message and c2.at > now() - interval '7 days' limit 6) vv) as versions
      from public.client_errors ce where at > now() - interval '7 days'
      group by message order by count(*) desc limit 50) x), '[]'::jsonb),
    'error_series', (select jsonb_agg(jsonb_build_object('h', h, 'n', (
        select count(*) from public.client_errors where at >= h and at < h + interval '1 hour')) order by h)
      from (select date_trunc('hour', now()) - make_interval(hours => g) as h from generate_series(0, 47) g) hh),
    'active_24h', (select count(*) from public.user_seen where last_seen > now() - interval '1 day'),
    'error_users_24h', (select count(distinct ce.user_id) from public.client_errors ce
                        join public.user_seen s on s.user_id = ce.user_id
                        where ce.at > now() - interval '1 day' and s.last_seen > now() - interval '1 day'),
    'by_version', coalesce((select jsonb_agg(to_jsonb(x) order by x.n desc) from (
      select coalesce(nullif(version, ''), '?') as version, count(*) as n, count(distinct user_id) as people
      from public.client_errors where at > now() - interval '7 days' group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'tokens', jsonb_build_object(
      'total', (select count(*) from public.push_tokens),
      'people', (select count(distinct user_id) from public.push_tokens),
      'instant', (select count(*) from public.push_tokens where caps like '%data1%'),
      'stale_30d', (select count(*) from public.push_tokens where updated_at < now() - interval '30 days')),
    'presence_failing', (select count(distinct user_id) from public.client_errors
                         where source = 'presence' and at > now() - interval '1 day')
  ) into r;
  return r;
end $$;
grant execute on function public.admin_health2() to authenticated;

-- ============================================================== notifications

create or replace function public.admin_broadcasts2(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.sent_at desc) from (
    select b.id, b.title, b.body, b.path, b.audience, b.sent_at, b.people, b.phones, b.targeted, b.instant, b.failed,
           b.delivered as accepted,
           coalesce(nullif(p.name, ''), split_part(u.email, '@', 1)) as sent_by,
           (select count(*) from public.broadcast_receipts r where r.broadcast_id = b.id and r.delivered_at is not null) as reached,
           (select count(*) from public.broadcast_receipts r where r.broadcast_id = b.id and r.opened_at is not null) as opened
    from public.broadcasts b
    left join auth.users u on u.id = b.sent_by
    left join public.profiles p on p.user_id = b.sent_by
    order by b.sent_at desc limit least(greatest(p_limit, 1), 200)) x), '[]'::jsonb);
end $$;
grant execute on function public.admin_broadcasts2(int) to authenticated;

/** Branches and years students put on their profiles (for notification segments). */
create or replace function public.admin_segments()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'branches', coalesce((select jsonb_agg(jsonb_build_object('v', b, 'n', n) order by n desc) from (
      select trim(branch) b, count(*) n from public.profiles where coalesce(trim(branch), '') <> '' group by 1 order by 2 desc limit 30) x), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(jsonb_build_object('v', year, 'n', n) order by year) from (
      select year, count(*) n from public.profiles where year is not null group by 1) x), '[]'::jsonb)
  );
end $$;
grant execute on function public.admin_segments() to authenticated;

-- ============================================================== actions

/**
 * Signs a student out everywhere: their sessions (and so their refresh tokens)
 * are removed, so the app can't renew its sign-in. The access token they hold
 * keeps working until it expires (an hour at most). Owner only.
 */
create or replace function public.admin_force_signout(p_user uuid)
returns int language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  perform public.assert_admin(true);
  if p_user = auth.uid() then raise exception 'That would sign you out — use Log out instead'; end if;
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  perform public.audit('user.signout', p_user::text, jsonb_build_object('sessions', n));
  return n;
end $$;
grant execute on function public.admin_force_signout(uuid) to authenticated;

/**
 * Sends a student back to "Confirm it's you": their MyCamu link is removed, so
 * the next time DockIn opens they verify again with their own MyCamu — the fix
 * for an account verified with someone else's. Owner only.
 */
create or replace function public.admin_reset_identity(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare e text;
begin
  perform public.assert_admin(true);
  delete from public.identities where user_id = p_user returning enrollment into e;
  insert into public.identity_events (kind, enrollment, user_id, detail)
  values ('reset', e, p_user, jsonb_build_object('by', auth.uid()));
  perform public.audit('identity.reset', p_user::text, jsonb_build_object('enrollment', e));
end $$;
grant execute on function public.admin_reset_identity(uuid) to authenticated;
