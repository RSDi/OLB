-- 0043_daves_idea_supporters.sql
--
-- Dave's Idea: LLM-suggested supporters per action item. The extraction LLM
-- fills this ONLY when the transcript explicitly says someone helps the owner
-- on that item ("Dave, help Jeff with the cigars") — not everyone in the room.
-- Names are matched to members live in the UI (same as the owner suggestion),
-- so no member-id column is stored.
--
-- Visibility unchanged: existing owner-only RLS on the row covers this column.
--
-- Depends on 0041 (assignment columns).

begin;

alter table public.daves_idea_action_items
  add column if not exists suggested_supporter_names text[] not null default '{}'::text[];

commit;
