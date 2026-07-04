-- 0078_slack_archive_search.sql
--
-- Search support for the Slack Channel Archive: filter by author and search
-- message text, across every registered channel.
--
-- The exceptions page (0077 follow-up work) already hit a real statement
-- timeout from an unindexed cross-channel scan at ~9,500 rows — this table
-- only grows, so search is built index-first rather than adding a naive
-- `message_text ilike '%...%'` scan that would hit the same wall.
--
-- message_text_search: a generated, always-in-sync tsvector column (no sync
-- code changes needed — Postgres maintains it on every insert/update) with
-- a GIN index, queried via websearch_to_tsquery (handles natural typed
-- queries, including quoted phrases, without the user needing to learn
-- tsquery syntax).
--
-- author_name + posted_at composite index: the "filter by user" picker and
-- results list both filter/sort on these; without it, an author-only
-- search (no text query) would fall back to the same kind of full-table
-- sort that caused the exceptions-page timeout.
--
-- Depends on 0077 (slack_archive_messages). Idempotent.

begin;

alter table public.slack_archive_messages
  add column if not exists message_text_search tsvector
  generated always as (to_tsvector('english', coalesce(message_text, ''))) stored;

create index if not exists slack_archive_messages_text_search_idx
  on public.slack_archive_messages using gin (message_text_search);

create index if not exists slack_archive_messages_author_posted_idx
  on public.slack_archive_messages (author_name, posted_at)
  where author_name is not null;

commit;
