-- 0029: DockIn Admin — the founder's dashboard.
--
-- What it adds:
--   admins         who may open the dashboard (owner / moderator)
--   user_seen      one row per student: last open, app version, platform, and
--                  setup health (Camu / LMS / notifications) — never their data
--   user_days      which days each student opened DockIn (daily / weekly / monthly active)
--   bans           suspended accounts (the app shows why; content inserts are refused)
--   reports        "Report" from chat: the reported message's text, kept for review
--   broadcasts     notifications the founder sent, and to how many
--   client_errors  crashes the app ran into (message + where + version)
--   app_config     an in-app announcement banner, set from the dashboard
--   downloads      taps on the /download link
--   admin_audit    every admin action, who and when
-- plus admin_* functions that refuse anyone who is not an admin.
--
-- After running this, make yourself the owner (your DockIn username):
--   insert into public.admins (user_id, role)
--   select id, 'owner' from auth.users where email = '<your-username>@dockin.app';

-- ---------------------------------------------------------------- admins
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'moderator' check (role in ('owner', 'moderator')),
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- no policies: only the functions below read it

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from public.admins where user_id = uid);
$$;
grant execute on function public.is_admin(uuid) to authenticated;

create or replace function public.admin_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.admins where user_id = auth.uid();
$$;
grant execute on function public.admin_role() to authenticated;

create or replace function public.assert_admin(owner_only boolean default false)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid() and (not owner_only or role = 'owner')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;
revoke all on function public.assert_admin(boolean) from public, anon;

-- ---------------------------------------------------------------- presence
create table if not exists public.user_seen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  opens int not null default 1,
  platform text check (char_length(platform) <= 10),
  app_version text check (char_length(app_version) <= 30),
  channel text check (char_length(channel) <= 12),
  camu boolean,
  lms boolean,
  notifications text check (char_length(notifications) <= 12)
);
create index if not exists user_seen_last_idx on public.user_seen (last_seen desc);
alter table public.user_seen enable row level security;

create table if not exists public.user_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
create index if not exists user_days_day_idx on public.user_days (day);
alter table public.user_days enable row level security;

-- The app calls this when it opens (and every half hour it stays open).
create or replace function public.seen(p_platform text, p_version text, p_channel text, p_camu boolean, p_lms boolean, p_notif text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  insert into public.user_seen as s (user_id, platform, app_version, channel, camu, lms, notifications)
  values (me, left(p_platform, 10), left(p_version, 30), left(p_channel, 12), p_camu, p_lms, left(p_notif, 12))
  on conflict (user_id) do update set
    last_seen = now(),
    opens = s.opens + case when s.last_seen < now() - interval '30 minutes' then 1 else 0 end,
    platform = coalesce(excluded.platform, s.platform),
    app_version = coalesce(excluded.app_version, s.app_version),
    channel = coalesce(excluded.channel, s.channel),
    camu = coalesce(excluded.camu, s.camu),
    lms = coalesce(excluded.lms, s.lms),
    notifications = coalesce(excluded.notifications, s.notifications);
  insert into public.user_days (user_id, day) values (me, (now() at time zone 'Asia/Kolkata')::date)
  on conflict do nothing;
end $$;
revoke all on function public.seen(text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.seen(text, text, text, boolean, boolean, text) to authenticated;

-- ---------------------------------------------------------------- bans
create table if not exists public.bans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 300),
  banned_by uuid references auth.users (id) on delete set null,
  banned_at timestamptz not null default now(),
  until timestamptz
);
alter table public.bans enable row level security;
drop policy if exists bans_own on public.bans;
create policy bans_own on public.bans for select to authenticated using (user_id = auth.uid());

create or replace function public.is_banned(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bans where user_id = uid and (until is null or until > now()));
$$;
grant execute on function public.is_banned(uuid) to authenticated;

-- A suspended account can still read, but can't post anything new.
create or replace function public.refuse_banned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'Your DockIn account is suspended.' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['messages', 'shares', 'friends', 'groups', 'group_members', 'poll_votes', 'message_reactions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists refuse_banned on public.%I', t);
      execute format('create trigger refuse_banned before insert on public.%I for each row execute function public.refuse_banned()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- reports
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target uuid references auth.users (id) on delete cascade,
  message_id uuid,
  thread text check (char_length(thread) <= 120),
  reason text not null check (char_length(reason) between 1 and 300),
  excerpt text not null default '' check (char_length(excerpt) <= 600),
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  unique (reporter, message_id)
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter = auth.uid() and target is distinct from auth.uid() and status = 'open');
drop trigger if exists refuse_banned on public.reports;

-- ---------------------------------------------------------------- broadcasts, errors, config, downloads, audit
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 80),
  body text not null check (char_length(body) <= 240),
  path text not null default '/' check (char_length(path) <= 120),
  audience jsonb not null default '{}'::jsonb,
  sent_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  people int not null default 0,
  phones int not null default 0,
  delivered int not null default 0
);
alter table public.broadcasts enable row level security;

create table if not exists public.client_errors (
  id bigserial primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  message text not null check (char_length(message) <= 300),
  source text not null default '' check (char_length(source) <= 200),
  version text not null default '' check (char_length(version) <= 30)
);
create index if not exists client_errors_at_idx on public.client_errors (at desc);
alter table public.client_errors enable row level security;
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors for insert to authenticated with check (user_id = auth.uid());

create table if not exists public.app_config (
  key text primary key check (key in ('announcement')),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);

create table if not exists public.downloads (
  id bigserial primary key,
  at timestamptz not null default now(),
  channel text not null default 'stable' check (char_length(channel) <= 12),
  agent text not null default '' check (char_length(agent) <= 200)
);
create index if not exists downloads_at_idx on public.downloads (at desc);
alter table public.downloads enable row level security;

create table if not exists public.admin_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  admin uuid references auth.users (id) on delete set null,
  action text not null,
  target text,
  detail jsonb
);
alter table public.admin_audit enable row level security;

create or replace function public.audit(p_action text, p_target text, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit (admin, action, target, detail) values (auth.uid(), p_action, p_target, p_detail);
$$;
revoke all on function public.audit(text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- dashboard reads
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  day_start timestamptz := (today::timestamp at time zone 'Asia/Kolkata');
  r jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'new_today', (select count(*) from auth.users where created_at >= day_start),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'online', (select count(*) from public.user_seen where last_seen > now() - interval '5 minutes'),
    'dau', (select count(*) from public.user_days where day = today),
    'wau', (select count(distinct user_id) from public.user_days where day > today - 7),
    'mau', (select count(distinct user_id) from public.user_days where day > today - 30),
    'seen', (select count(*) from public.user_seen),
    'android', (select count(*) from public.user_seen where platform = 'android'),
    'web', (select count(*) from public.user_seen where platform = 'web'),
    'preview', (select count(*) from public.user_seen where channel = 'preview'),
    'profiles', (select count(*) from public.profiles),
    'camu', (select count(*) from public.user_seen where camu),
    'lms', (select count(*) from public.user_seen where lms),
    'notif_on', (select count(*) from public.user_seen where notifications = 'granted'),
    'push', (select count(distinct user_id) from public.push_tokens),
    'push_instant', (select count(distinct user_id) from public.push_tokens where caps like '%data1%'),
    'with_friends', (select count(distinct x) from (select a as x from public.friends where status = 'accepted' union all select b from public.friends where status = 'accepted') f),
    'groups', (select count(*) from public.groups),
    'messages_today', (select count(*) from public.messages where created_at >= day_start),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days'),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'banned', (select count(*) from public.bans where until is null or until > now()),
    'errors_24h', (select count(*) from public.client_errors where at > now() - interval '1 day'),
    'downloads', (select count(*) from public.downloads),
    'downloads_7d', (select count(*) from public.downloads where at > now() - interval '7 days'),
    'versions', (
      select coalesce(jsonb_agg(jsonb_build_object('v', v, 'n', n) order by n desc), '[]'::jsonb)
      from (select coalesce(app_version, '?') v, count(*) n from public.user_seen
            where last_seen > now() - interval '30 days' group by 1 order by 2 desc limit 8) x),
    'series', (
      select jsonb_agg(jsonb_build_object(
        'd', d,
        'signups', (select count(*) from auth.users u where (u.created_at at time zone 'Asia/Kolkata')::date = d),
        'active', (select count(*) from public.user_days ud where ud.day = d),
        'messages', (select count(*) from public.messages m where (m.created_at at time zone 'Asia/Kolkata')::date = d),
        'downloads', (select count(*) from public.downloads dl where (dl.at at time zone 'Asia/Kolkata')::date = d)
      ) order by d)
      from (select today - g as d from generate_series(0, 29) g) days)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_users(p_q text default '', p_filter text default 'all', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb; q text := lower(coalesce(trim(p_q), ''));
begin
  perform public.assert_admin();
  with base as (
    select
      u.id, split_part(u.email, '@', 1) as username, u.created_at,
      coalesce(p.name, '') as name, p.code, p.branch, p.year, p.section, p.avatar,
      s.last_seen, s.opens, s.platform, s.app_version, s.channel, s.camu, s.lms, s.notifications,
      exists (select 1 from public.push_tokens t where t.user_id = u.id) as push,
      (select count(*) from public.friends f where f.status = 'accepted' and (f.a = u.id or f.b = u.id)) as friends,
      (select count(*) from public.reports rp where rp.target = u.id) as reports,
      b.reason as ban_reason, b.until as ban_until,
      (b.user_id is not null and (b.until is null or b.until > now())) as banned
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.user_seen s on s.user_id = u.id
    left join public.bans b on b.user_id = u.id
  ), picked as (
    select * from base
    where (q = '' or lower(username) like '%' || q || '%' or lower(name) like '%' || q || '%' or lower(coalesce(code, '')) like '%' || q || '%')
      and case p_filter
        when 'active' then last_seen > now() - interval '7 days'
        when 'inactive' then last_seen is null or last_seen < now() - interval '7 days'
        when 'new' then created_at > now() - interval '7 days'
        when 'android' then platform = 'android'
        when 'web' then platform = 'web'
        when 'no_camu' then camu is not true
        when 'no_push' then not push
        when 'reported' then reports > 0
        when 'banned' then banned
        else true end
  )
  select jsonb_build_object(
    'total', (select count(*) from picked),
    'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from picked order by coalesce(last_seen, created_at) desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
    ) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_users(text, text, int, int) to authenticated;

create or replace function public.admin_user(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'user', (select to_jsonb(x) from (select u.id, split_part(u.email, '@', 1) as username, u.created_at, u.last_sign_in_at from auth.users u where u.id = p_id) x),
    'profile', (select to_jsonb(p) - 'share_attendance' from public.profiles p where p.user_id = p_id),
    'seen', (select to_jsonb(s) from public.user_seen s where s.user_id = p_id),
    'days', (select coalesce(jsonb_agg(day order by day), '[]'::jsonb) from public.user_days where user_id = p_id and day > today - 35),
    'phones', (select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'caps', caps, 'updated_at', updated_at)), '[]'::jsonb) from public.push_tokens where user_id = p_id),
    'messages', (select count(*) from public.messages where author = p_id),
    'messages_7d', (select count(*) from public.messages where author = p_id and created_at > now() - interval '7 days'),
    'friends', (select count(*) from public.friends f where f.status = 'accepted' and (f.a = p_id or f.b = p_id)),
    'groups', (select count(*) from public.group_members where user_id = p_id),
    'ban', (select to_jsonb(b) from public.bans b where b.user_id = p_id),
    'reports', (select coalesce(jsonb_agg(to_jsonb(rp) order by rp.created_at desc), '[]'::jsonb) from (
      select id, reason, excerpt, status, created_at from public.reports where target = p_id order by created_at desc limit 20) rp),
    'reported_others', (select count(*) from public.reports where reporter = p_id),
    'errors', (select count(*) from public.client_errors where user_id = p_id and at > now() - interval '7 days')
  ) into r;
  return r;
end $$;
grant execute on function public.admin_user(uuid) to authenticated;

create or replace function public.admin_reports(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select r.id, r.reason, r.excerpt, r.thread, r.message_id, r.status, r.created_at, r.handled_at,
      r.target, coalesce(pt.name, split_part(ut.email, '@', 1)) as target_name, split_part(ut.email, '@', 1) as target_username,
      r.reporter, coalesce(pr.name, split_part(ur.email, '@', 1)) as reporter_name,
      (select count(*) from public.reports r2 where r2.target = r.target) as target_reports,
      public.is_banned(r.target) as target_banned
    from public.reports r
    left join auth.users ut on ut.id = r.target left join public.profiles pt on pt.user_id = r.target
    left join auth.users ur on ur.id = r.reporter left join public.profiles pr on pr.user_id = r.reporter
    where p_status = 'all' or r.status = p_status
    order by r.created_at desc limit 200) x), '[]'::jsonb);
end $$;
grant execute on function public.admin_reports(text) to authenticated;

create or replace function public.admin_resolve_report(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  perform public.assert_admin();
  if p_action not in ('dismiss', 'delete_message', 'actioned') then raise exception 'bad action'; end if;
  select message_id into m from public.reports where id = p_id;
  if p_action = 'delete_message' and m is not null then
    update public.messages set deleted_at = now() where id = m and deleted_at is null;
  end if;
  update public.reports set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
    handled_by = auth.uid(), handled_at = now()
  where id = p_id or (p_action = 'delete_message' and m is not null and message_id = m and status = 'open');
  perform public.audit('report.' || p_action, p_id::text, jsonb_build_object('message', m));
end $$;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;

create or replace function public.admin_errors()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.n desc) from (
    select message, count(*) n, count(distinct user_id) people, max(at) last_at,
      (array_agg(source order by at desc))[1] as source, (array_agg(version order by at desc))[1] as version
    from public.client_errors where at > now() - interval '7 days'
    group by message order by count(*) desc limit 40) x), '[]'::jsonb);
end $$;
grant execute on function public.admin_errors() to authenticated;

create or replace function public.admin_broadcasts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(to_jsonb(b) order by b.sent_at desc) from (
    select * from public.broadcasts order by sent_at desc limit 50) b), '[]'::jsonb);
end $$;
grant execute on function public.admin_broadcasts() to authenticated;

create or replace function public.admin_audit_log(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.at desc) from (
    select a.at, a.action, a.target, a.detail, coalesce(p.name, split_part(u.email, '@', 1)) as admin_name
    from public.admin_audit a left join auth.users u on u.id = a.admin left join public.profiles p on p.user_id = a.admin
    order by a.at desc limit least(greatest(p_limit, 1), 500)) x), '[]'::jsonb);
end $$;
grant execute on function public.admin_audit_log(int) to authenticated;

-- The in-app announcement: { text, tone: info|warn|good, link, id } or {} to clear.
create or replace function public.admin_set_announcement(p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin(true);
  insert into public.app_config (key, value, updated_at) values ('announcement', coalesce(p_value, '{}'::jsonb), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.audit('announcement.set', null, p_value);
end $$;
grant execute on function public.admin_set_announcement(jsonb) to authenticated;

-- Team: the owner adds or removes moderators by DockIn username.
create or replace function public.admin_team()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'role', a.role, 'added_at', a.added_at,
    'username', split_part(u.email, '@', 1), 'name', coalesce(p.name, '')) order by a.added_at)
    from public.admins a join auth.users u on u.id = a.user_id left join public.profiles p on p.user_id = a.user_id), '[]'::jsonb);
end $$;
grant execute on function public.admin_team() to authenticated;

create or replace function public.admin_set_member(p_username text, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  perform public.assert_admin(true);
  select id into uid from auth.users where email = lower(trim(p_username)) || '@dockin.app';
  if uid is null then raise exception 'No DockIn account called %', p_username; end if;
  if uid = auth.uid() then raise exception 'You can''t change your own role'; end if;
  if p_role = 'none' then delete from public.admins where user_id = uid;
  elsif p_role in ('owner', 'moderator') then
    insert into public.admins (user_id, role) values (uid, p_role) on conflict (user_id) do update set role = excluded.role;
  else raise exception 'bad role'; end if;
  perform public.audit('team.' || p_role, uid::text, jsonb_build_object('username', p_username));
end $$;
grant execute on function public.admin_set_member(text, text) to authenticated;
