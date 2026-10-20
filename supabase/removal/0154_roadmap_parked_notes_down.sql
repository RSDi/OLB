-- Down for 0154_roadmap_parked_notes.sql
-- Drops bot history and removes Parked from the status check. Fails if any
-- item is still in parked — move those first.

begin;

drop table if exists public.olb_roadmap_events;

alter table public.olb_roadmap_items
  drop constraint if exists olb_roadmap_items_status_check;
alter table public.olb_roadmap_items
  add constraint olb_roadmap_items_status_check
    check (status in ('released', 'preview', 'progress', 'planned', 'proposed'));

notify pgrst, 'reload schema';

commit;
