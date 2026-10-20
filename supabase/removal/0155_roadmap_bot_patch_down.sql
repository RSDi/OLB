-- Down for 0155_roadmap_bot_patch.sql
-- Drops the transactional bot PATCH function. Card history
-- (olb_roadmap_events) is left in place until 0154's down.

begin;

drop function if exists public.bot_patch_roadmap_item(uuid, text, text, text, date, timestamptz, text, boolean);

notify pgrst, 'reload schema';

commit;
