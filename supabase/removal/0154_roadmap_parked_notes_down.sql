-- Down for 0154_roadmap_parked_notes.sql
--
-- Parked cards are moved back to Proposed (they never have a released_on)
-- so restoring the old status check does not fail. Then bot history is
-- DROPPED. Do not run this against a database whose olb_roadmap_events
-- rows you still need — there is no archive. Run 0155's down first if the
-- bot_patch_roadmap_item function exists.

begin;

update public.olb_roadmap_items
   set status = 'proposed',
       released_on = null
 where status = 'parked';

drop table if exists public.olb_roadmap_events;

alter table public.olb_roadmap_items
  drop constraint if exists olb_roadmap_items_status_check;
alter table public.olb_roadmap_items
  add constraint olb_roadmap_items_status_check
    check (status in ('released', 'preview', 'progress', 'planned', 'proposed'));

notify pgrst, 'reload schema';

commit;
