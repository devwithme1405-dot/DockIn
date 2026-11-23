-- 0028: a forwarded document opens for the people it was forwarded to.
--
-- Chat files live in the folder of the chat they were first sent in, and only
-- that chat's members could open them. Forwarding put the same file card in a
-- second chat whose members could not open it. New app versions copy the file
-- into the other chat's folder when forwarding; this lets the documents that were
-- forwarded before that open too: you can read a file when a message in a chat
-- you are in carries it, and whoever posted that message can still read it
-- themselves (so a path from a chat you have left can't be re-posted to read it).

create index if not exists messages_file_path_idx on public.messages ((data->>'path'));

create or replace function public.can_read_chat_file(p text, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and exists (
    select 1
    from public.messages m
    where m.data->>'path' = p
      and m.deleted_at is null
      and public.can_use_thread(m.thread, uid)
      and public.can_use_thread(replace(split_part(p, '/', 1), '_', ':'), m.author)
  );
$$;
revoke all on function public.can_read_chat_file(text, uuid) from public, anon;
grant execute on function public.can_read_chat_file(text, uuid) to authenticated;

drop policy if exists chat_files_read on storage.objects;
create policy chat_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-files'
    and (
      public.can_use_thread(replace((storage.foldername(name))[1], '_', ':'), auth.uid())
      or public.can_read_chat_file(name, auth.uid())
    )
  );
