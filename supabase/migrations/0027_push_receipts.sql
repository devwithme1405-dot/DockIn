-- Push v2: DockIn shows chat notifications itself (so they arrive even with the
-- app closed) and the phone confirms delivery for the sender's ✓✓.

-- What a phone's DockIn can handle: 'data1' = shows data pushes itself and sends receipts.
alter table public.push_tokens add column if not exists caps text;

-- Run only by the server (/api/delivered) after checking the signed receipt.
create or replace function public.mark_delivered_for(p_user uuid, p_thread text, p_at timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.thread_reads (user_id, thread, read_at, delivered_at)
  values (p_user, p_thread, 'epoch', least(p_at, now()))
  on conflict (user_id, thread) do update
    set delivered_at = greatest(coalesce(public.thread_reads.delivered_at, 'epoch'), excluded.delivered_at);
$$;

revoke all on function public.mark_delivered_for(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_delivered_for(uuid, text, timestamptz) to service_role;
