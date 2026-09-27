-- Building-shutdown wizard, Phase 2a: link an event to a runnable "shutdown"
-- playbook. When set, the event needs a building shutdown using that procedure
-- — the event page shows a Start-shutdown wizard, and the completion FYI posted
-- to the playbook's Slack channel links back to the event.
--
-- This column is the forward-compatible seam for Phase 2c: once events gain a
-- recurrence rule, the generator will spawn one shutdown task per occurrence
-- off this same link. on delete set null so deleting a playbook just unlinks it
-- from any events (mirrors events.source_ticket_id).
alter table public.events
  add column if not exists shutdown_playbook_id uuid
    references public.playbooks(id) on delete set null;

create index if not exists events_shutdown_playbook_idx
  on public.events (shutdown_playbook_id)
  where deleted_at is null;
