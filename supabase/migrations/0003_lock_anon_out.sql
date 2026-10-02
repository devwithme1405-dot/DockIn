-- ---------------------------------------------------------------------------
-- DockIn, migration 3: shut the front door as well as the inner one.
--
-- Supabase grants the `anon` role read access to every new table in `public` by
-- default. Row level security already keeps anonymous callers from seeing a
-- single row, but relying on one mechanism alone is thin: if a policy were ever
-- dropped by mistake, the whole directory would be readable by anybody holding
-- the publishable key, which ships in the browser bundle.
--
-- So: take the grant away, and assert that RLS really is on. Running this is the
-- check — it raises if any table is unprotected.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

revoke all on
  public.profiles,
  public.friends,
  public.groups,
  public.group_members,
  public.shares,
  public.share_targets
from anon;

-- And stop the default from putting it back on anything added later.
alter default privileges in schema public revoke all on tables from anon;

do $$
declare
  t text;
  unprotected text[] := '{}';
begin
  foreach t in array array[
    'profiles','friends','groups','group_members','shares','share_targets','sync_records','allowed_emails'
  ] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relrowsecurity
    ) then
      unprotected := unprotected || t;
    end if;
  end loop;

  if array_length(unprotected, 1) is not null then
    raise exception 'Row level security is OFF for: %. Re-run 0001_init.sql and 0002_social.sql.',
      array_to_string(unprotected, ', ');
  end if;

  raise notice 'Row level security is on for every DockIn table, and anon has been locked out.';
end $$;
