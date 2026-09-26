-- 0010_pm_per_asset.sql
--
-- Adds an explicit `per_asset` flag to pm_templates so a template can fan
-- out to "every asset in the area" without needing to also specify a type.
--
-- Before this migration, fan-out was gated on `asset_type IS NOT NULL`,
-- which forced users with system-style areas (e.g. an "HVAC" area where
-- everything inside is already implicitly HVAC) to invent a redundant type
-- string. With per_asset, the template explicitly opts in to per-asset
-- behavior and uses asset_type (when set) only as an additional filter.
--
-- Semantics:
--   per_asset = false  → single area-level task (current default)
--   per_asset = true   → fan out:
--     - filter by area_id when set
--     - additionally filter by asset_type when set
--     - error if no matching assets exist
--
-- Backfill: any existing template with asset_type set was relying on the
-- old "type implies fan-out" rule — flip per_asset to true for those rows
-- so their behavior doesn't change.

begin;

alter table public.pm_templates
  add column if not exists per_asset boolean not null default false;

update public.pm_templates
set per_asset = true
where asset_type is not null and per_asset = false;

commit;
