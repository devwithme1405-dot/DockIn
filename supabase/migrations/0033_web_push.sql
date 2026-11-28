-- Web Push subscriptions (for iPhone/web PWA notifications). Separate from the
-- Android FCM push_tokens — this is the browser Push API (VAPID). iOS delivers
-- these only to a home-screen-installed PWA (16.4+). Service-role only.

create table if not exists public.web_push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists web_push_subs_user on public.web_push_subs(user_id);

alter table public.web_push_subs enable row level security;
-- No policies: the service role (API routes) is the only reader/writer.
revoke all on public.web_push_subs from anon, authenticated;
