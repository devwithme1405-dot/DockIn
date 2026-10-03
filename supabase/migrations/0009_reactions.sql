-- ---------------------------------------------------------------------------
-- DockIn, migration 9: reactions on a shared assignment.
--
-- One reaction per person per post, replaced when they tap another. Not a
-- counter per emoji: a thread where six people can each add five faces turns
-- into noise, and the point of a reaction here is "I have seen this" or "same",
-- said in one tap and read at a glance.
--
-- Who reacted is visible to everyone who can see the post, because a reaction
-- with no face on it is just a number.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

create table if not exists public.share_reactions (
  share_id   uuid not null references public.shares (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default clock_timestamp(),
  primary key (share_id, user_id)
);

alter table public.share_reactions enable row level security;
create index if not exists share_reactions_share_idx on public.share_reactions (share_id);

-- Anyone who can see the post can see its reactions. The rule is the same one
-- shares_select uses, stated through the helpers that already exist so the two
-- cannot drift apart.
create or replace function public.can_see_share(sid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shares s
    where s.id = sid
      and s.deleted_at is null
      and (
        s.author = uid
        or (s.group_id is not null and public.is_group_member(s.group_id, uid))
        or public.is_share_target(s.id, uid)
      )
  );
$$;

revoke all on function public.can_see_share(uuid, uuid) from public, anon;
grant execute on function public.can_see_share(uuid, uuid) to authenticated;

drop policy if exists share_reactions_select on public.share_reactions;
create policy share_reactions_select on public.share_reactions for select to authenticated
  using (public.can_see_share(share_id, (select auth.uid())));

-- You may only react as yourself, and only to something you can see.
drop policy if exists share_reactions_insert on public.share_reactions;
create policy share_reactions_insert on public.share_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_see_share(share_id, (select auth.uid()))
  );

drop policy if exists share_reactions_update on public.share_reactions;
create policy share_reactions_update on public.share_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists share_reactions_delete on public.share_reactions;
create policy share_reactions_delete on public.share_reactions for delete to authenticated
  using (user_id = (select auth.uid()));
