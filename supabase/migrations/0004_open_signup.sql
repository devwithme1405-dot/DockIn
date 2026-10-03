-- ---------------------------------------------------------------------------
-- DockIn, migration 4: let anyone sign up.
--
-- The first migration locked sign-up to one email domain. That made sense when
-- the plan was "Bennett students only", but in practice it has only kept people
-- out: the person building the app could not test with their own address, and
-- nobody could be shown the thing without a college account.
--
-- The lock is not deleted, just switched off. `allowed_domain()` returning an
-- empty string means "no restriction"; put a domain back in it and every rule
-- that used to apply starts applying again, with no other change.
--
-- Nothing about privacy changes. People still find each other only by code, and
-- row level security still decides what anybody can read.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

create or replace function public.allowed_domain()
returns text language sql immutable as $$
  -- '' = open to everyone. Set it to e.g. 'bennett.edu.in' to lock it down again.
  select ''::text
$$;

create or replace function public.is_allowed_email(addr text)
returns boolean
language sql stable security definer set search_path = public as $$
  select addr is not null and (
    public.allowed_domain() = ''
    or lower(addr) like '%@' || public.allowed_domain()
    or exists (select 1 from public.allowed_emails e where e.email = lower(addr))
  );
$$;

-- The message the trigger raises should say what is actually enforced.
create or replace function public.block_non_bennett_signup()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_allowed_email(new.email) then
    raise exception 'This email address cannot sign up for DockIn.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
begin
  if public.allowed_domain() = '' then
    raise notice 'Sign-up is open to any email address.';
  else
    raise notice 'Sign-up is limited to @% and anything in allowed_emails.', public.allowed_domain();
  end if;
end $$;
