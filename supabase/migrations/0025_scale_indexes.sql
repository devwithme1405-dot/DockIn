-- 0025: indexes for a busier DockIn (1000+ students at once).
--
-- Chat catch-up asks for "every message after time X" across all of your
-- chats. The existing index is (thread, created_at), which can't answer that
-- across threads, so Postgres would read the whole messages table and filter.
-- This one lets it jump straight to the recent rows.
--
-- Safe to run more than once. Takes a moment's lock on messages while it builds,
-- which is fine at DockIn's size.

create index if not exists messages_created_idx on public.messages (created_at);

-- "Seen by" reads everyone's read marks for your chats, by thread.
create index if not exists thread_reads_thread_idx on public.thread_reads (thread);

analyze public.messages;
analyze public.thread_reads;
