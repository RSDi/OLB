-- 0125_player_notes_slack.sql
--
-- Notes saved from the Slack Archive (Save to notes) keep the messages
-- themselves, so the note shows them the way the archive does: who wrote
-- each one and when, the text with Slack's formatting and emoji, reactions,
-- and each message's pictures under it. jsonb:
--   {channel_id, channel_label, ts,
--    messages: [{ts, author_name, posted_at, message_text, edited,
--                reactions: [{name, count, users: [{name}]}],
--                files: [{name, type, path}]}]}
-- A file's path is one of the note's attachments (0124); a null path stayed
-- in the archive. Null for notes written by hand. The note's body is the
-- line the saver added.
--
-- Apply via the Supabase SQL editor, after 0124. Idempotent.

alter table public.olb_player_notes add column if not exists slack jsonb;
