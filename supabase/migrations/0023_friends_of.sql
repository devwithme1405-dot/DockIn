-- See who a friend is friends with, and add them straight from there.
--
-- friends_of(target): the accepted friends of someone you are friends with
-- (or your own), each with where you stand with them. Nobody you have blocked
-- (or who blocked you) is listed. Strangers get nothing.
--
-- request_friend(them): a friend request by user id instead of by code — but
-- only to someone who is friends with one of your friends (that is, someone a
-- friends_of() list could have shown you). It behaves exactly like add_friend:
-- running it twice is harmless, and if they already asked you it accepts.

create or replace function public.friends_of(target uuid)
returns table (
  user_id uuid, name text, avatar text, branch text, year int,
  relation text, since bigint
)
language sql stable security definer set search_path = public as $$
  select p.user_id,
         coalesce(nullif(btrim(p.name), ''), public.account_name(p.user_id)),
         p.avatar, p.branch, p.year,
         case
           when p.user_id = auth.uid() then 'me'
           when mf.status = 'accepted' then 'friend'
           when mf.status = 'pending' and mf.requested_by = auth.uid() then 'sent'
           when mf.status = 'pending' then 'received'
           else null
         end,
         f.updated_at
  from public.friends f
  join public.profiles p
    on p.user_id = case when f.a = target then f.b else f.a end
  left join public.friends mf
    on mf.a = least(auth.uid(), p.user_id) and mf.b = greatest(auth.uid(), p.user_id)
  where target in (f.a, f.b)
    and f.status = 'accepted'
    and auth.uid() is not null
    and (auth.uid() = target or public.are_friends(auth.uid(), target))
    and not public.is_blocked(auth.uid(), target)
    and not public.is_blocked(auth.uid(), p.user_id)
  order by 2;
$$;
revoke all on function public.friends_of(uuid) from public, anon;
grant execute on function public.friends_of(uuid) to authenticated;

create or replace function public.request_friend(them uuid)
returns public.friends language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  row    public.friends;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not public.is_allowed_email(auth.jwt() ->> 'email') then
    raise exception 'this account cannot use DockIn';
  end if;
  if them is null then raise exception 'no_such_user'; end if;
  if them = me then raise exception 'thats_you'; end if;
  if not exists (select 1 from public.profiles where user_id = them) then
    raise exception 'no_such_user';
  end if;

  -- Only someone one of my friends is friends with.
  if not exists (
    select 1
    from public.friends x
    join public.friends y
      on y.status = 'accepted'
     and them in (y.a, y.b)
     and (case when x.a = me then x.b else x.a end) in (y.a, y.b)
     and (case when x.a = me then x.b else x.a end) <> them
    where me in (x.a, x.b) and x.status = 'accepted'
  ) and not exists (
    -- or someone who already sent me a request
    select 1 from public.friends z
    where z.a = least(me, them) and z.b = greatest(me, them)
  ) then
    raise exception 'not_reachable';
  end if;

  insert into public.friends (a, b, requested_by, status, created_at, updated_at)
  values (least(me, them), greatest(me, them), me, 'pending', now_ms, now_ms)
  on conflict (a, b) do update
    set status     = case when public.friends.requested_by <> me then 'accepted' else public.friends.status end,
        updated_at = now_ms
  returning * into row;
  return row;
end $$;
revoke all on function public.request_friend(uuid) from public, anon;
grant execute on function public.request_friend(uuid) to authenticated;
