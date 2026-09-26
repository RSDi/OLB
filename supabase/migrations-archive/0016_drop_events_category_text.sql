-- 0016_drop_events_category_text.sql
--
-- Drops the legacy events.category text column that 0015 left in place as a
-- safety net during the FK migration. Nothing in the codebase references it
-- anymore (the events list, dashboard, and forms all use category_id +
-- joined event_categories.name/chip_class).
--
-- Idempotent.

begin;

alter table public.events
  drop column if exists category;

commit;
