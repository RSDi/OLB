-- 0040_daves_idea_soft_delete.sql
--
-- Relaxes RLS on daves_idea_recordings so the owner can see + update their
-- soft-deleted rows (needed for the "Settings → Deleted" restore flow), and
-- adds a DELETE policy that only permits hard-deleting rows that are already
-- soft-deleted.
--
-- The application-side loader (loadDavesIdeaRecordings) keeps filtering by
-- deleted_at IS NULL, so the main recordings list view still hides them.

begin;

-- Allow owner to read their own deleted rows too (needed for Deleted tab).
drop policy if exists "daves_idea_recordings_select_own" on public.daves_idea_recordings;
create policy "daves_idea_recordings_select_own" on public.daves_idea_recordings
  for select to authenticated
  using (user_id = auth.uid());

-- Allow owner to update their soft-deleted rows (e.g. setting deleted_at
-- back to null to restore, or soft-deleting via deleted_at = now()).
drop policy if exists "daves_idea_recordings_update_own" on public.daves_idea_recordings;
create policy "daves_idea_recordings_update_own" on public.daves_idea_recordings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Hard delete is permitted only on already-soft-deleted rows the user owns.
-- The two-step guard prevents a stale client from escalating a single click
-- into permanent loss.
drop policy if exists "daves_idea_recordings_delete_own" on public.daves_idea_recordings;
create policy "daves_idea_recordings_delete_own" on public.daves_idea_recordings
  for delete to authenticated
  using (user_id = auth.uid() and deleted_at is not null);

commit;
