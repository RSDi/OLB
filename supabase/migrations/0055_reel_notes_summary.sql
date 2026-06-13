-- 0055_reel_notes_summary.sql
--
-- ReelNotes readable summary. Alongside the action-item inbox, the pipeline
-- now also produces a Granola-style sectioned summary of the recording
-- (Situation / Plan / Timeline / Next Steps — headings chosen to fit the
-- content), shown under a "Summary" tab next to the transcript.
--
--   daves_idea_recordings.summary
--     — JSONB array of { heading, bullets[] }. NULL for recordings extracted
--       before this feature (and any that produce no summary); the UI then
--       just shows the transcript. Re-running extraction backfills it.
--       Nullable, no default, so existing rows are unaffected.
--
-- Idempotent; safe to re-run.

begin;

alter table public.daves_idea_recordings
  add column if not exists summary jsonb;

commit;
