-- 0079_slack_archive_author_counts.sql
--
-- Fast author list for the search page's "filter by user" picker. The
-- previous implementation (loadArchiveAuthors) paginated the entire
-- slack_archive_messages table in ~1000-row batches just to dedupe/count
-- author names in JS — correct, but wasteful: every search-page visit
-- shipped the whole table (9,500+ rows and growing) over the wire just to
-- compute a couple dozen distinct names.
--
-- SECURITY INVOKER (Postgres's default; stated explicitly here) means this
-- runs with the CALLING role's own permissions, so the existing
-- slack_archive_messages_select_super RLS policy still applies inside the
-- function — a non-super-admin caller gets zero rows back, same as
-- querying the table directly. Contrast with is_staff()/is_super_admin()
-- in 0001, which are SECURITY DEFINER on purpose (they need to read
-- members regardless of the caller's own row access) — this function has
-- no such need.
--
-- Depends on 0077 (slack_archive_messages) and 0078's
-- (author_name, posted_at) index, which a GROUP BY author_name can use.
-- Idempotent.

begin;

create or replace function public.archive_author_counts()
returns table (author_name text, message_count bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select author_name, count(*) as message_count
  from public.slack_archive_messages
  where author_name is not null
  group by author_name
  order by author_name
$$;

grant execute on function public.archive_author_counts() to authenticated;

commit;
