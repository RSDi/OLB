-- 0052_reel_notes_task_link.sql
--
-- B3: record from any task. A ReelNotes recording can be linked to the task
-- it was captured on; the pipeline posts the summary into that task's comment
-- thread when transcription finishes, and the task page lists its recordings.
--
-- Visibility: a recording LINKED to a task becomes readable by all committee
-- staff (it's task context now, not a private note). Unlinked recordings stay
-- owner-only exactly as before. Action items remain owner-only either way —
-- the posted comment is what carries the summary into the shared thread.
--
-- Idempotent; safe to re-run.

begin;

alter table public.daves_idea_recordings
  add column if not exists linked_ticket_id uuid references public.maintenance_requests(id) on delete set null;

create index if not exists daves_idea_recordings_linked_ticket_idx
  on public.daves_idea_recordings (linked_ticket_id)
  where linked_ticket_id is not null;

drop policy if exists "daves_idea_recordings_select_staff_linked" on public.daves_idea_recordings;
create policy "daves_idea_recordings_select_staff_linked" on public.daves_idea_recordings
  for select to authenticated
  using (linked_ticket_id is not null and deleted_at is null and public.is_staff());

commit;
