-- 0053_slack_threads.sql
--
-- B2: two-way Slack. The notifier already posts each new task/request to the
-- MCC Saints channel; this lets replies in that Slack thread flow back into
-- the task's comment history.
--
--   maintenance_requests.slack_channel_id / slack_message_ts
--     — where the notifier's message landed; a thread reply's thread_ts
--       matches slack_message_ts, which is how /api/slack/events finds the
--       task. Only tasks created after this ships get threads linked.
--
--   ticket_comments.author_id nullable + external_author
--     — a Slack reply is matched to a member by their Slack profile email;
--       when nobody matches, the comment is kept with the Slack display name
--       in external_author instead of being dropped.
--
--   ticket_comments.slack_ts + unique index
--     — Slack retries webhook deliveries; the unique index makes replay
--       inserts no-ops instead of duplicate comments.
--
-- Idempotent; safe to re-run.

begin;

alter table public.maintenance_requests
  add column if not exists slack_channel_id text,
  add column if not exists slack_message_ts text;

create index if not exists maintenance_requests_slack_ts_idx
  on public.maintenance_requests (slack_message_ts)
  where slack_message_ts is not null;

alter table public.ticket_comments
  alter column author_id drop not null;

alter table public.ticket_comments
  add column if not exists external_author text,
  add column if not exists slack_ts text;

create unique index if not exists ticket_comments_slack_ts_key
  on public.ticket_comments (slack_ts)
  where slack_ts is not null;

commit;
