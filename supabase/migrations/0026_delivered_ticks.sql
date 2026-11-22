-- WhatsApp-style ticks: ✓ on the server, ✓✓ on their phone, blue ✓✓ read.
--
-- "Delivered" is when a person's phone last received messages in a thread.
-- It lives next to the read mark; a row made only by a delivery starts with
-- read_at at the very beginning of time, so delivering never counts as reading.

alter table public.thread_reads add column if not exists delivered_at timestamptz;

create or replace function public.mark_delivered(p_thread text, p_at timestamptz)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.thread_reads (user_id, thread, read_at, delivered_at)
  values (auth.uid(), p_thread, 'epoch', least(p_at, now()))
  on conflict (user_id, thread) do update
    set delivered_at = greatest(coalesce(public.thread_reads.delivered_at, 'epoch'), excluded.delivered_at);
$$;

revoke all on function public.mark_delivered(text, timestamptz) from public;
grant execute on function public.mark_delivered(text, timestamptz) to authenticated;

-- Catching up on edits and "delete for everyone" made while a phone was away.
create index if not exists messages_edited_at_idx on public.messages (edited_at) where edited_at is not null;
create index if not exists messages_deleted_at_idx on public.messages (deleted_at) where deleted_at is not null;
