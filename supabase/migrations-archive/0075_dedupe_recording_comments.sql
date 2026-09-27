-- 0075_dedupe_recording_comments.sql
--
-- A recorded note is a ticket_comment tagged with recording_id (0065). The
-- adapter's onRecordingReady posted that comment with NO idempotency guard, so
-- re-processing a recording (retry-transcription / re-extract / a re-fired
-- transcription webhook) posted ANOTHER copy — the task thread then showed the
-- same recorded note two or more times.
--
-- This migration:
--   1. Soft-deletes the duplicate copies, keeping the earliest live comment per
--      recording.
--   2. Adds a partial-unique index so only ONE live comment can reference a
--      given recording going forward.
-- The adapter is updated (lib/reelnotes/adapter.ts) to update-or-insert, so
-- re-processing refreshes that one comment instead of duplicating/erroring.
--
-- Depends on 0065 (ticket_comments.recording_id). Apply via the Supabase SQL
-- editor. Idempotent.

begin;

-- 1. Soft-delete duplicate recorded-note comments, keeping the earliest live
--    one per recording. Hiding (not hard-deleting) preserves any replies and
--    matches the table's soft-delete model.
update public.ticket_comments c
   set deleted_at = now()
 where c.recording_id is not null
   and c.deleted_at is null
   and exists (
     select 1 from public.ticket_comments c2
      where c2.recording_id = c.recording_id
        and c2.deleted_at is null
        and (c2.created_at < c.created_at
             or (c2.created_at = c.created_at and c2.id < c.id))
   );

-- 2. Enforce one live comment per recording. NULL recording_id (ordinary typed
--    comments) is unaffected — Postgres treats NULLs as distinct.
create unique index if not exists ticket_comments_recording_uniq
  on public.ticket_comments (recording_id)
  where recording_id is not null and deleted_at is null;

commit;
