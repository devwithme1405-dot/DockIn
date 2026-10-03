-- ---------------------------------------------------------------------------
-- DockIn, migration 7: the file attached to a shared assignment.
--
-- Shape of the thing:
--   * One private bucket, `assignments`. Nothing in it is reachable by a URL
--     alone; every download is a signed link minted for someone who can already
--     see the share the file belongs to.
--   * Objects live at `<author uid>/<random>/<filename>`. Putting the owner in
--     the first folder means "may I write here" is a string comparison rather
--     than a lookup, so a file can be uploaded before the share row exists and
--     a half-finished post never leaves an unreachable file behind.
--   * Reading is the interesting half: you may read a file when you are its
--     author, or when some share you can see points at it. That is decided by
--     one SECURITY DEFINER function so the rule lives in exactly one place and
--     matches `shares_select` exactly.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assignments',
  'assignments',
  false,
  10485760, -- 10 MB; an assignment that does not fit is a drive link, not an upload
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Who may read a given object
-- ---------------------------------------------------------------------------

-- True when any share this person can see points at this object. SECURITY
-- DEFINER because a storage policy that read `shares` through its own policy
-- would be asking one RLS check to satisfy another; this keeps the rule here,
-- stated once, in the same terms as shares_select.
create or replace function public.can_read_assignment(objname text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.shares s
    where s.deleted_at is null
      and s.data -> 'file' ->> 'path' = objname
      and (
        s.author = auth.uid()
        or (s.group_id is not null and public.is_group_member(s.group_id, auth.uid()))
        or public.is_share_target(s.id, auth.uid())
      )
  );
$$;

revoke all on function public.can_read_assignment(text) from public, anon;
grant execute on function public.can_read_assignment(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row level security on the objects themselves
-- ---------------------------------------------------------------------------

drop policy if exists assignments_read on storage.objects;
create policy assignments_read on storage.objects for select to authenticated
  using (
    bucket_id = 'assignments'
    and (
      owner = (select auth.uid())
      or public.can_read_assignment(name)
    )
  );

-- You may only write inside your own folder, and only while your account is
-- allowed to use DockIn at all.
drop policy if exists assignments_write on storage.objects;
create policy assignments_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assignments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_allowed_email(auth.jwt() ->> 'email')
  );

drop policy if exists assignments_update on storage.objects;
create policy assignments_update on storage.objects for update to authenticated
  using (bucket_id = 'assignments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'assignments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Withdrawing a post, or replacing the file on one, deletes the object too.
drop policy if exists assignments_delete on storage.objects;
create policy assignments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'assignments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Nothing anonymous ever touches this bucket.
drop policy if exists assignments_anon_read on storage.objects;

-- ---------------------------------------------------------------------------
-- 4. Taking a post back should not leave its file behind
-- ---------------------------------------------------------------------------

-- Called by the app right before it deletes a share, and by the trigger below
-- as a backstop, so an orphan can only happen if both fail.
create or replace function public.forget_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  path text := old.data -> 'file' ->> 'path';
begin
  if path is not null then
    delete from storage.objects
    where bucket_id = 'assignments'
      and name = path
      and (storage.foldername(name))[1] = old.author::text;
  end if;
  return old;
end $$;

drop trigger if exists shares_forget_file on public.shares;
create trigger shares_forget_file after delete on public.shares
  for each row execute function public.forget_assignment();
