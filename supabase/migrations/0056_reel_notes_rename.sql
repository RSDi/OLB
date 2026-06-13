-- Phase 3 of the ReelNotes extraction: rename the two tables from their
-- Dave's-Idea-era names to the ReelNotes brand.
--
--   daves_idea_recordings   -> reel_notes_recordings
--   daves_idea_action_items -> reel_notes_action_items
--
-- Renaming a table carries its data, columns, indexes, RLS policies, triggers,
-- and foreign keys across automatically — only the table identifier changes.
-- (The index/policy/trigger NAMES still read daves_idea_*; that's cosmetic and
-- left as-is — they remain attached to the renamed tables and keep working.)
--
-- Idempotent: each rename runs only when the old table still exists and the new
-- one does not, so re-applying this file is a safe no-op.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'daves_idea_recordings'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'reel_notes_recordings'
  ) then
    alter table public.daves_idea_recordings rename to reel_notes_recordings;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'daves_idea_action_items'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'reel_notes_action_items'
  ) then
    alter table public.daves_idea_action_items rename to reel_notes_action_items;
  end if;
end $$;
