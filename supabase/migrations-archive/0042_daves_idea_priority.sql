-- 0042_daves_idea_priority.sql
--
-- Dave's Idea: per-action-item priority, inferred by the extraction LLM from
-- urgency cues in the transcript ("this is critical", "urgent", "we should get
-- on this" → higher). Mirrors the maintenance `priorities` keys (low / medium /
-- high / emergency) so it can pre-select a priority when an item is routed to a
-- maintenance request. Defaults to 'medium' (no special urgency mentioned).
--
-- Visibility unchanged: existing owner-only RLS on the row already covers this
-- column.
--
-- Depends on 0039 (daves_idea_action_items).

begin;

alter table public.daves_idea_action_items
  add column if not exists priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'emergency'));

commit;
