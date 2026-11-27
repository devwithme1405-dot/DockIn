-- 0030 · Who each account really is: the student's enrollment number, read from
-- their own MyCamu sign-in, becomes their DockIn username.
--
-- One MyCamu student (camu_stu_id, MyCamu's internal id) ↔ one DockIn account ↔
-- one enrollment. Only the server (service role) writes here; a student can
-- read their own row. Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enrollment text not null unique check (enrollment ~ '^[A-Z]{1,2}[0-9]{2}[A-Z]{2,6}[0-9]{2,6}$'),
  camu_stu_id text not null unique check (camu_stu_id ~ '^[a-f0-9]{24}$'),
  camu_name text check (char_length(camu_name) <= 80),
  verified_at timestamptz not null default now()
);
alter table public.identities enable row level security;
drop policy if exists identities_own on public.identities;
create policy identities_own on public.identities for select to authenticated using (user_id = auth.uid());

-- Every time an enrollment had to be taken back or was disputed, for the team.
create table if not exists public.identity_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('verified', 'renamed_holder', 'conflict', 'already_linked')),
  enrollment text,
  user_id uuid,
  other_user uuid,
  detail jsonb not null default '{}'::jsonb
);
alter table public.identity_events enable row level security;

-- The account whose username is this email, for the server only.
create or replace function public.identity_user_by_email(p_email text)
returns uuid language sql stable security definer set search_path = auth, public as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.identity_user_by_email(text) from public, anon, authenticated;
grant execute on function public.identity_user_by_email(text) to service_role;

-- DockIn Admin: how many accounts are confirmed, and what needed a decision.
create or replace function public.admin_identity()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'verified', (select count(*) from public.identities),
    'unverified_named', (select count(*) from auth.users where email like 'unverified-%'),
    'events', (
      select coalesce(jsonb_agg(e order by e.at desc), '[]'::jsonb) from (
        select ie.at, ie.kind, ie.enrollment, ie.detail,
               split_part(u.email, '@', 1) as username,
               split_part(o.email, '@', 1) as other_username
        from public.identity_events ie
        left join auth.users u on u.id = ie.user_id
        left join auth.users o on o.id = ie.other_user
        where ie.kind <> 'verified'
        order by ie.at desc limit 50) e)
  );
end $$;
grant execute on function public.admin_identity() to authenticated;
