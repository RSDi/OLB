-- 0012_supplies.sql
--
-- Phase 2.6: Supplies / parts inventory.
--
-- `supplies` is the catalog: each row a part the church stocks (filters,
-- bulbs, gaskets, etc.) with current on-hand qty and a reorder threshold.
-- `asset_supplies` links each asset to the supplies it needs, with the
-- typical qty consumed per maintenance event.
-- `supply_usage` logs every consumption so we have an audit trail when
-- inventory looks wrong. Usage can reference a PM instance, a PM per-asset
-- sub-record, or a maintenance ticket — at most one of those at a time.
--
-- Quantities are numeric(10,2) to support partial units (e.g. 0.5 bottle).
--
-- Depends on 0001 (is_staff, is_super_admin, set_updated_at), 0005
-- (maintenance_requests), 0008 (pm_instances), 0009 (assets,
-- pm_instance_assets).

begin;

create table if not exists public.supplies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  unit               text not null default 'each',
  on_hand            numeric(10, 2) not null default 0,
  reorder_threshold  numeric(10, 2) not null default 0,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint supplies_qty_nonnegative
    check (on_hand >= 0 and reorder_threshold >= 0)
);

create unique index if not exists supplies_name_active_uniq
  on public.supplies (lower(name))
  where deleted_at is null;

drop trigger if exists supplies_set_updated_at on public.supplies;
create trigger supplies_set_updated_at
  before update on public.supplies
  for each row execute function public.set_updated_at();

create table if not exists public.asset_supplies (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references public.assets(id) on delete cascade,
  supply_id    uuid not null references public.supplies(id),
  qty_per_use  numeric(10, 2) not null default 1,
  notes        text,
  created_at   timestamptz not null default now(),
  constraint asset_supplies_qty_positive check (qty_per_use > 0),
  constraint asset_supplies_unique unique (asset_id, supply_id)
);

create index if not exists asset_supplies_asset_idx on public.asset_supplies (asset_id);
create index if not exists asset_supplies_supply_idx on public.asset_supplies (supply_id);

create table if not exists public.supply_usage (
  id                       uuid primary key default gen_random_uuid(),
  supply_id                uuid not null references public.supplies(id),
  qty_used                 numeric(10, 2) not null,
  used_at                  timestamptz not null default now(),
  used_by                  uuid references public.members(id),
  pm_instance_asset_id     uuid references public.pm_instance_assets(id),
  pm_instance_id           uuid references public.pm_instances(id),
  maintenance_request_id   uuid references public.maintenance_requests(id),
  notes                    text,
  constraint supply_usage_qty_positive check (qty_used > 0),
  -- At most one source reference per usage row (helps reporting + integrity).
  constraint supply_usage_one_source check (
    (case when pm_instance_asset_id   is null then 0 else 1 end) +
    (case when pm_instance_id         is null then 0 else 1 end) +
    (case when maintenance_request_id is null then 0 else 1 end) <= 1
  )
);

create index if not exists supply_usage_supply_idx
  on public.supply_usage (supply_id, used_at desc);
create index if not exists supply_usage_pm_asset_idx
  on public.supply_usage (pm_instance_asset_id)
  where pm_instance_asset_id is not null;
create index if not exists supply_usage_pm_instance_idx
  on public.supply_usage (pm_instance_id)
  where pm_instance_id is not null;
create index if not exists supply_usage_ticket_idx
  on public.supply_usage (maintenance_request_id)
  where maintenance_request_id is not null;

-- RLS
alter table public.supplies enable row level security;
alter table public.asset_supplies enable row level security;
alter table public.supply_usage enable row level security;

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('supplies','asset_supplies','supply_usage')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- supplies: staff read non-deleted; super-admin sees deleted too; staff edit;
-- super-admin soft-delete + hard-delete.
create policy "supplies_select_staff" on public.supplies
  for select to authenticated
  using (deleted_at is null and public.is_staff());

create policy "supplies_select_deleted_super" on public.supplies
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "supplies_insert_staff" on public.supplies
  for insert to authenticated
  with check (public.is_staff());

create policy "supplies_update_staff" on public.supplies
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "supplies_update_super" on public.supplies
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "supplies_delete_super" on public.supplies
  for delete to authenticated
  using (public.is_super_admin());

-- asset_supplies: staff read/write; super-admin hard-delete.
create policy "asset_supplies_select_staff" on public.asset_supplies
  for select to authenticated
  using (public.is_staff());

create policy "asset_supplies_insert_staff" on public.asset_supplies
  for insert to authenticated
  with check (public.is_staff());

create policy "asset_supplies_update_staff" on public.asset_supplies
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "asset_supplies_delete_staff" on public.asset_supplies
  for delete to authenticated
  using (public.is_staff());

-- supply_usage: staff read + insert; super-admin can update/delete (audit).
create policy "supply_usage_select_staff" on public.supply_usage
  for select to authenticated
  using (public.is_staff());

create policy "supply_usage_insert_staff" on public.supply_usage
  for insert to authenticated
  with check (public.is_staff());

create policy "supply_usage_update_super" on public.supply_usage
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "supply_usage_delete_super" on public.supply_usage
  for delete to authenticated
  using (public.is_super_admin());

-- Atomic decrement helper. Avoids the read-then-write race two concurrent
-- PM completions could otherwise hit on the same supply. Floors at 0 so
-- we don't end up with negative inventory if someone over-logs usage.
create or replace function public.decrement_supply(
  p_supply_id uuid,
  p_qty numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_qty numeric;
begin
  if not public.is_staff() then
    raise exception 'Only staff can decrement supplies';
  end if;
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;
  update public.supplies
  set on_hand = greatest(0, on_hand - p_qty)
  where id = p_supply_id and deleted_at is null
  returning on_hand into new_qty;
  if new_qty is null then
    raise exception 'Supply % not found or deleted', p_supply_id;
  end if;
  return new_qty;
end
$$;

grant execute on function public.decrement_supply(uuid, numeric) to authenticated;

commit;

