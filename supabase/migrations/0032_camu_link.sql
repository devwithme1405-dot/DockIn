-- Server-side MyCamu link: a student connects their MyCamu email/password login
-- once, and DockIn's server does outpass / approve / attendance / timetable / mess
-- on their behalf — so it works on iPhone and any browser, not just the Android app.
--
-- The password is stored ENCRYPTED (AES-256-GCM, key only on the server in
-- CAMU_ENC_KEY) and this table has RLS on with NO policies, so nothing but the
-- service role (the API routes) can ever read it. No client, admin included,
-- can select a row.

create table if not exists public.camu_creds (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  -- AES-256-GCM: iv:ciphertext:tag, all base64. Decrypts only with CAMU_ENC_KEY.
  pwd_enc       text not null,
  -- The MyCamu ids learned at login (loggedInId, stuId, inId, …) so follow-up
  -- calls need no second round-trip. Not secret on their own.
  ids           jsonb,
  -- The live MyCamu session cookie (connect.sid), encrypted like the password,
  -- reused until it expires so we don't sign in on every call.
  session_enc   text,
  session_at    timestamptz,
  name          text,
  stu_id        text,
  linked_at     timestamptz not null default now(),
  last_ok       timestamptz
);

alter table public.camu_creds enable row level security;
-- No policies on purpose: service role only.

revoke all on public.camu_creds from anon, authenticated;

-- How many students have linked MyCamu server-side (for the admin overview).
create or replace function public.admin_camu_links()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'linked', (select count(*) from public.camu_creds),
    'active_7d', (select count(*) from public.camu_creds where last_ok > now() - interval '7 days')
  );
end $$;
grant execute on function public.admin_camu_links() to authenticated;
