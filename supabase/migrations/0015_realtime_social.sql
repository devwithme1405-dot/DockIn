-- Live updates for Friends: a request, an accept, someone joining a group or a
-- task being shared shows up on the other phone straight away (RLS still
-- decides who sees which row). Safe to run again.
do $$
declare
  t text;
begin
  foreach t in array array['friends', 'group_members', 'shares', 'share_targets', 'share_progress'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
