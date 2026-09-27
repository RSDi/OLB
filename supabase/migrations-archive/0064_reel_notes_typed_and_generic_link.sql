-- 0064_reel_notes_typed_and_generic_link.sql
--
-- ReelNotes-on-Tasks integration. Three changes, all on the ReelNotes tables
-- plus one column on members:
--
-- 1. TYPED NOTES. A "note" can now be typed (plain text, no audio, no AI) as
--    well as recorded. Typed notes are first-class reel_notes_recordings rows
--    (source='typed', status='ready', transcript = the typed text, no audio),
--    so they travel with the ReelNotes package when it's extracted. Requires
--    audio_blob_url to be nullable and 'typed' to be an allowed source.
--
-- 2. GENERIC PARENT LINK. Replaces the OLB-specific linked_ticket_id (FK ->
--    maintenance_requests) with a portable (linked_entity_type, linked_entity_id)
--    pair the host interprets. OLB writes ('task', <ticket id>). This removes the
--    only app-specific FK from the recordings table, which is the portability win
--    ReelNotes wants before extraction. Trade-off: no FK cascade, so a *hard*-
--    deleted task leaves a dangling linked_entity_id (tasks are soft-deleted in
--    practice, so this is benign — a dangling id simply resolves to no task).
--
-- 3. INLINE ACTION ITEMS ON THE TASK. Today a linked recording is staff-readable
--    (0052) but its action items stay owner-only, so a teammate viewing the task
--    can't see or act on them. To render action items inline on the task we grant
--    staff read + staff update on action items whose parent recording is linked.
--
-- Plus members.things_enabled: per-user opt-in that gates the device-only
-- "push to Things" affordance (it shouldn't show for people who don't use Things).
--
-- Depends on 0056 (reel_notes_* rename) being applied first. Idempotent.

begin;

-- ---------------------------------------------------------------------------
-- 1. Typed notes: audio optional, 'typed' source allowed.
-- ---------------------------------------------------------------------------

alter table public.reel_notes_recordings
  alter column audio_blob_url drop not null;

-- The source check came from 0039 with a fixed name; swap it for one that also
-- allows 'typed'. Drop-by-name then re-add (the original constraint name is the
-- table-prefixed default Postgres assigned in 0039).
alter table public.reel_notes_recordings
  drop constraint if exists daves_idea_recordings_source_check;
alter table public.reel_notes_recordings
  drop constraint if exists reel_notes_recordings_source_check;
alter table public.reel_notes_recordings
  add constraint reel_notes_recordings_source_check
  check (source in ('pwa', 'native', 'watch', 'typed'));

-- ---------------------------------------------------------------------------
-- 2. Generic parent link (replaces linked_ticket_id from 0052).
-- ---------------------------------------------------------------------------

alter table public.reel_notes_recordings
  add column if not exists linked_entity_type text,
  add column if not exists linked_entity_id   uuid;

-- Backfill existing task links into the generic columns.
update public.reel_notes_recordings
  set linked_entity_type = 'task',
      linked_entity_id   = linked_ticket_id
  where linked_ticket_id is not null
    and linked_entity_id is null;

create index if not exists reel_notes_recordings_linked_entity_idx
  on public.reel_notes_recordings (linked_entity_type, linked_entity_id)
  where linked_entity_id is not null;

-- Recreate the staff-read policy to key off the generic link (any linked
-- recording is shared task/work context, so readable by committee staff).
drop policy if exists "daves_idea_recordings_select_staff_linked" on public.reel_notes_recordings;
drop policy if exists "reel_notes_recordings_select_staff_linked" on public.reel_notes_recordings;
create policy "reel_notes_recordings_select_staff_linked" on public.reel_notes_recordings
  for select to authenticated
  using (linked_entity_id is not null and deleted_at is null and public.is_staff());

-- Drop the old OLB-specific column, its index, and FK (carried by the column).
drop index if exists public.daves_idea_recordings_linked_ticket_idx;
alter table public.reel_notes_recordings
  drop column if exists linked_ticket_id;

-- ---------------------------------------------------------------------------
-- 3. Action items of a LINKED recording: staff read + staff update.
--    (Owner-only policies from 0039 remain; these are additive for staff so
--    teammates can see and route/check items that surfaced on a shared task.)
-- ---------------------------------------------------------------------------

drop policy if exists "reel_notes_action_items_select_staff_linked" on public.reel_notes_action_items;
create policy "reel_notes_action_items_select_staff_linked" on public.reel_notes_action_items
  for select to authenticated
  using (
    public.is_staff() and exists (
      select 1 from public.reel_notes_recordings r
      where r.id = recording_id
        and r.linked_entity_id is not null
        and r.deleted_at is null
    )
  );

drop policy if exists "reel_notes_action_items_update_staff_linked" on public.reel_notes_action_items;
create policy "reel_notes_action_items_update_staff_linked" on public.reel_notes_action_items
  for update to authenticated
  using (
    public.is_staff() and exists (
      select 1 from public.reel_notes_recordings r
      where r.id = recording_id
        and r.linked_entity_id is not null
        and r.deleted_at is null
    )
  )
  with check (
    public.is_staff() and exists (
      select 1 from public.reel_notes_recordings r
      where r.id = recording_id
        and r.linked_entity_id is not null
        and r.deleted_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Per-user Things opt-in.
-- ---------------------------------------------------------------------------

alter table public.members
  add column if not exists things_enabled boolean not null default false;

commit;
