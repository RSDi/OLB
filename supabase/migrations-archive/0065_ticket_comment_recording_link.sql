-- 0065_ticket_comment_recording_link.sql
--
-- ReelNotes-on-Tasks, take 2: a recorded note IS a comment. When a recording
-- linked to a task finishes transcribing, onRecordingReady posts its summary as
-- a ticket_comment (as it already did). This adds a back-reference from that
-- comment to its recording so the task's comment thread can render the
-- recording's action items inline (with a device-only push-to-Things button)
-- and a link to the full transcript in ReelNotes.
--
-- Nullable: ordinary typed comments have no recording. ON DELETE SET NULL so
-- hard-deleting a recording leaves the comment text intact (it's still a
-- readable summary). Idempotent.

begin;

alter table public.ticket_comments
  add column if not exists recording_id uuid
    references public.reel_notes_recordings(id) on delete set null;

create index if not exists ticket_comments_recording_idx
  on public.ticket_comments (recording_id)
  where recording_id is not null;

commit;
