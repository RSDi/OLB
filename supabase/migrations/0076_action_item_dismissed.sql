-- 0076_action_item_dismissed.sql
--
-- ReelNotes action items from a recording linked to a task now surface in that
-- task's To-Dos as "suggested" rows the committee can Accept (promote into a
-- real To-Do — sets action_items.task_id, migration 0068) or Dismiss. This adds
-- the `dismissed` flag so a dismissed suggestion stays gone.
--
-- "Suggested" = task_id is null (not promoted) AND dismissed is false.
--
-- Depends on 0064 (reel_notes_action_items) + 0068 (task_id). Idempotent.

begin;

alter table public.reel_notes_action_items
  add column if not exists dismissed boolean not null default false;

commit;
