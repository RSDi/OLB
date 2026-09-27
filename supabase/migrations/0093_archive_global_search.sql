-- 0093_archive_global_search.sql
--
-- Slack messages in the portal's global search. search_global (0000) is
-- unchanged: the search box calls this function alongside it and shows the
-- rows as their own "Slack" group (lib/slack-archive/global-search.ts). It
-- stays a separate function so the Slack archive is still removable as a
-- unit: dropping the archive means dropping this function with its tables
-- (see supabase/migrations-archive/0077_slack_archive.sql) and removing the
-- one call in lib/search/useGlobalSearch.ts.
--
-- Security invoker, like the archive's other search functions: RLS on
-- slack_archive_messages and slack_archive_channels (0084) limits the rows
-- to the channels the caller may see, so a private channel's messages only
-- reach its members.
--
-- Matching works as you type, like the rest of global search: each word of
-- two or more letters or digits must start a word in the message, with
-- English stemming ("practic" finds "practice" and "practicing"). Only
-- letters and digits reach to_tsquery, so no input can make it raise a
-- syntax error. Best match first, newest first among equals.
--
-- Under RLS, Postgres can't use the GIN index from 0078 for this match (@@
-- isn't leakproof, so it may only run after the policy check), so it scans
-- the messages the caller can see: about 35 ms for 60,000 messages, the
-- same as the archive's own search page. Moving the visibility check out of
-- RLS into a security definer function would get the index back, at the
-- cost of a second copy of who-can-see-what.
--
-- Apply via the Supabase SQL editor, after 0092. Idempotent.

create or replace function public.archive_search_global(p_query text, p_limit integer default 5)
returns table (
  id uuid,
  channel_id text,
  channel_label text,
  ts text,
  author_name text,
  message_text text,
  posted_at timestamptz,
  rank real
)
language sql
stable
set search_path = public
as $$
  with prefix_query as (
    select to_tsquery('english', string_agg(term || ':*', ' & ')) as tsq
    from regexp_split_to_table(lower(coalesce(p_query, '')), '[^[:alnum:]]+') as term
    where char_length(term) >= 2
  )
  select
    m.id,
    m.channel_id,
    c.label,
    m.ts,
    m.author_name,
    m.message_text,
    m.posted_at,
    ts_rank(m.message_text_search, p.tsq) as rank
  from prefix_query p
  join public.slack_archive_messages m on m.message_text_search @@ p.tsq
  join public.slack_archive_channels c on c.slack_channel_id = m.channel_id
  -- No words left, or only stop words ("the", "and"): nothing to find.
  where numnode(p.tsq) > 0
  order by rank desc, m.posted_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20)
$$;

revoke execute on function public.archive_search_global(text, integer) from public, anon;
grant execute on function public.archive_search_global(text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
