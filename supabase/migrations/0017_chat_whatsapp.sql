-- Chat, WhatsApp-style: edited messages, group photos and descriptions, and
-- live read receipts. Run once after 0016. Safe to run again.

alter table public.messages add column if not exists edited_at timestamptz;

alter table public.groups add column if not exists photo text check (photo is null or char_length(photo) <= 40);
alter table public.groups add column if not exists about text check (about is null or char_length(about) <= 300);

-- "Seen": read marks stream to the other people in the chat.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'thread_reads'
  ) then
    alter publication supabase_realtime add table public.thread_reads;
  end if;
end $$;
