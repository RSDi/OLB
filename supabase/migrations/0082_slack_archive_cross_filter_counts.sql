-- 0082_slack_archive_cross_filter_counts.sql
--
-- Faceted-search support for the search page: narrows each picker (user,
-- channel) by whatever's currently selected in the OTHER picker plus any
-- text query, so selecting a channel narrows "Filter by user" down to only
-- people who actually posted there, and selecting a user narrows "Filter by
-- channel" down to only channels they've posted in — each facet computed
-- from the other facets, never from itself (the standard faceted-search
-- shape: a facet's own selection doesn't restrict its own option list).
--
-- Companions to 0079's archive_author_counts() and 0081's
-- archive_author_counts_for_query() — again new functions rather than
-- widening either of those, since CREATE OR REPLACE can't change a
-- function's parameter list (see 0081's header for the full reasoning).
-- These two supersede 0081 for the search page's dynamic narrowing calls
-- (query-only narrowing is just the p_channel_ids/p_authors = null case);
-- 0081's function is left in place, unused, rather than dropped.
--
-- Same SECURITY INVOKER / RLS reasoning as 0079/0081: runs as the calling
-- role, so slack_archive_messages_select_super still applies.
--
-- Depends on 0077 (slack_archive_messages) and 0078's message_text_search
-- tsvector + GIN index. Idempotent.

begin;

create or replace function public.archive_author_counts_filtered(
  p_query text default null,
  p_channel_ids text[] default null
)
returns table (author_name text, message_count bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select author_name, count(*) as message_count
  from public.slack_archive_messages
  where author_name is not null
    and (p_channel_ids is null or channel_id = any(p_channel_ids))
    and (p_query is null or p_query = '' or message_text_search @@ websearch_to_tsquery('english', p_query))
  group by author_name
  order by author_name
$$;

grant execute on function public.archive_author_counts_filtered(text, text[]) to authenticated;

create or replace function public.archive_channel_counts_filtered(
  p_query text default null,
  p_authors text[] default null
)
returns table (channel_id text, message_count bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select channel_id, count(*) as message_count
  from public.slack_archive_messages
  where (p_authors is null or author_name = any(p_authors))
    and (p_query is null or p_query = '' or message_text_search @@ websearch_to_tsquery('english', p_query))
  group by channel_id
$$;

grant execute on function public.archive_channel_counts_filtered(text, text[]) to authenticated;

commit;
