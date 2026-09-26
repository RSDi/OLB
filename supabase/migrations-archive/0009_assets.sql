-- 0009_assets.sql
--
-- Phase 2.5: Asset tracking.
--
-- `assets` are first-class physical things the church owns and maintains —
-- HVAC units, sound boards, projectors, etc. Each asset lives in an area
-- (optional) and has a free-form `type` text used to group it with peers
-- (e.g. all type='hvac' assets are filter-eligible).
--
-- PM templates gain an optional `asset_type` field. When set, generating an
-- instance creates one parent `pm_instances` row PLUS a `pm_instance_assets`
-- sub-record for every active asset matching that type (and area, if the
-- template's area_id is set). Each sub-record has its own checklist progress
-- and notes — letting techs record per-unit observations without burying
-- them in a single combined notes field.
--
-- Depends on 0001 (is_staff, is_super_admin, set_updated_at), 0002 (areas),
-- 0008 (pm_templates, pm_instances).

begin;

-- 1. Assets table.
create table if not exists public.assets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  area_id     uuid references public.areas(id),
  type        text,
  notes       text,
  attributes  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists assets_name_active_uniq
  on public.assets (lower(name))
  where deleted_at is null;

create index if not exists assets_type_active_idx
  on public.assets (type)
  where deleted_at is null and type is not null;

create index if not exists assets_area_active_idx
  on public.assets (area_id)
  where deleted_at is null;

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

-- 2. pm_templates gains asset_type (nullable). Templates with asset_type set
--    generate per-asset sub-records on instance creation.
alter table public.pm_templates
  add column if not exists asset_type text;

-- 3. pm_instance_assets — per-asset sub-records for asset-scoped instances.
create table if not exists public.pm_instance_assets (
  id            uuid primary key default gen_random_uuid(),
  instance_id   uuid not null references public.pm_instances(id) on delete cascade,
  asset_id      uuid not null references public.assets(id),
  step_checks   jsonb not null default '[]'::jsonb,
  notes         text,
  status        text not null default 'pending',
  completed_at  timestamptz,
  completed_by  uuid references public.members(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pm_instance_assets_status_check
    check (status in ('pending','in_progress','done','skipped')),
  constraint pm_instance_assets_unique unique (instance_id, asset_id)
);

create index if not exists pm_instance_assets_instance_idx
  on public.pm_instance_assets (instance_id);

create index if not exists pm_instance_assets_asset_history_idx
  on public.pm_instance_assets (asset_id, created_at desc);

create index if not exists pm_instance_assets_status_idx
  on public.pm_instance_assets (status);

drop trigger if exists pm_instance_assets_set_updated_at on public.pm_instance_assets;
create trigger pm_instance_assets_set_updated_at
  before update on public.pm_instance_assets
  for each row execute function public.set_updated_at();

-- RLS
alter table public.assets enable row level security;
alter table public.pm_instance_assets enable row level security;

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('assets','pm_instance_assets')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Assets: staff read non-deleted; super-admin sees deleted; staff edit; super
-- soft-delete & hard-delete.
create policy "assets_select_staff" on public.assets
  for select to authenticated
  using (deleted_at is null and public.is_staff());

create policy "assets_select_deleted_super" on public.assets
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "assets_insert_staff" on public.assets
  for insert to authenticated
  with check (public.is_staff());

create policy "assets_update_staff" on public.assets
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "assets_update_super" on public.assets
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "assets_delete_super" on public.assets
  for delete to authenticated
  using (public.is_super_admin());

-- pm_instance_assets: staff read/write; super hard-delete.
create policy "pm_instance_assets_select_staff" on public.pm_instance_assets
  for select to authenticated
  using (public.is_staff());

create policy "pm_instance_assets_insert_staff" on public.pm_instance_assets
  for insert to authenticated
  with check (public.is_staff());

create policy "pm_instance_assets_update_staff" on public.pm_instance_assets
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "pm_instance_assets_delete_super" on public.pm_instance_assets
  for delete to authenticated
  using (public.is_super_admin());

commit;
