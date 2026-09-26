-- 0070_clear_orphaned_action_item_links.sql
--
-- One-time cleanup: release ReelNotes action items whose promoted sub-task has
-- since been deleted (or soft-deleted). Such an item is stuck showing as a
-- "Sub-task" reference pointing at a task that no longer exists, and can't be
-- re-promoted. Clearing task_id returns it to "actionable".
--
-- Going forward this can't recur: softDeleteTicket() now clears the link when a
-- sub-task is removed, and the FK is ON DELETE SET NULL for hard deletes. This
-- migration just sweeps up links created before that fix.
--
-- Idempotent; safe to re-run (only touches genuinely orphaned links).

begin;

update public.reel_notes_action_items ai
   set task_id = null
 where ai.task_id is not null
   and not exists (
     select 1
       from public.maintenance_requests m
      where m.id = ai.task_id
        and m.deleted_at is null
   );

commit;
