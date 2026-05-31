-- 0041_daves_idea_assignments.sql
--
-- Dave's Idea: assign a responsible "owner" member and "supporter" members to
-- each extracted action item, plus an LLM-suggested owner the user confirms.
--
-- Visibility is unchanged: assignment is private metadata on the recorder's own
-- action item (label-only). We do NOT share the task with the assignee, so no
-- new RLS is needed — the existing daves_idea_action_items policies already
-- scope these columns to the recording owner (user_id = auth.uid()), and any
-- approved directory member can be named (no portal account required).
--
-- These live as columns on daves_idea_action_items (same shape as routed_to /
-- done) rather than a join table, matching how the rest of the feature stores
-- per-item state.
--
-- Depends on 0039 (daves_idea_action_items) and the members table.

begin;

alter table public.daves_idea_action_items
  -- The single person taking responsibility. null = unassigned.
  add column if not exists owner_member_id        uuid references public.members(id) on delete set null,
  -- Supporting members (additional people, not distinct named roles). Flat
  -- array; no FK integrity, which is acceptable for private label metadata —
  -- members are soft-deleted and names are resolved against the loaded list.
  add column if not exists supporter_member_ids   uuid[] not null default '{}'::uuid[],
  -- The LLM's guess of who's responsible (a first name / nickname as said in
  -- the transcript) and the member it confidently matched, if any. Drives the
  -- "Suggested: …" accept/override affordance; null when nobody was named.
  add column if not exists suggested_assignee_name text,
  add column if not exists suggested_member_id     uuid references public.members(id) on delete set null;

create index if not exists daves_idea_action_items_owner_idx
  on public.daves_idea_action_items (owner_member_id)
  where owner_member_id is not null;

commit;
