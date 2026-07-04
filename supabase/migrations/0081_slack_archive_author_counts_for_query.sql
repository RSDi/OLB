-- 0081_slack_archive_author_counts_for_query.sql
--
-- Companion to 0079's archive_author_counts(): that function lists every
-- author across the whole archive, which is right for the search page's
-- initial "filter by user" picker but wrong once a text search has actually
-- run — the picker kept showing all ~40 authors regardless of the query, so
-- picking "Jeff Malone" after searching "dude" looked plausible even though
-- Jeff never said "dude" in any archived message. This gives the search
-- page a second RPC, scoped to authors whose messages actually match a
-- given websearch query, so the picker can narrow itself to who could
-- possibly have a result.
--
-- Deliberately a new function rather than adding a default parameter to
-- archive_author_counts(): CREATE OR REPLACE requires an identical
-- parameter list to replace an existing function, and 0079's version has
-- zero parameters — changing that would require a drop, and callers that
-- already invoke the zero-arg RPC would need to change too. Cheaper and
-- safer to add a second function with its own name.
--
-- Same SECURITY INVOKER / RLS reasoning as 0079: runs as the calling role,
-- so slack_archive_messages_select_super still applies — a non-super-admin
-- caller gets zero rows, same as querying the table directly.
--
-- Depends on 0078 (message_text_search tsvector + GIN index) and 0079.
-- Idempotent.

begin;

create or replace function public.archive_author_counts_for_query(p_query text)
returns table (author_name text, message_count bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select author_name, count(*) as message_count
  from public.slack_archive_messages
  where author_name is not null
    and message_text_search @@ websearch_to_tsquery('english', p_query)
  group by author_name
  order by author_name
$$;

grant execute on function public.archive_author_counts_for_query(text) to authenticated;

commit;
