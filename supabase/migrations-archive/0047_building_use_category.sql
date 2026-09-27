-- 0047_building_use_category.sql
-- Seeds a "Building Use" task category so requests from the intake wizard get
-- their own chip/label and queue filter. OPTIONAL/cosmetic:
-- createBuildingUseRequest() falls back to "Event" then "General" if this is
-- not applied, so the feature works either way.
-- Depends on 0044 (task_categories).

begin;

insert into public.task_categories (name, chip_class, sort_order)
select 'Building Use', 'rsd-chip-accent', 15
where not exists (
  select 1 from public.task_categories
  where lower(name) = lower('Building Use') and deleted_at is null
);

commit;
