-- 0044_task_categories.sql
--
-- Reframe Phase 1b: "maintenance requests" become generic Tasks with a
-- category, of which Maintenance is just one. Adds a managed task_categories
-- lookup (mirrors event_categories: admin-renameable, colored, sortable) and a
-- category_id on maintenance_requests, backfilling every existing row to
-- "Maintenance". The physical table name stays maintenance_requests.
--
-- Depends on 0001 (is_staff/is_super_admin/set_updated_at), 0005 (maintenance_requests).

begin;

create table if not exists public.task_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  chip_class  text not null default 'rsd-chip-mute',
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists task_categories_name_active_uniq
  on public.task_categories (lower(name)) where deleted_at is null;
create index if not exists task_categories_sort_idx
  on public.task_categories (sort_order, name) where deleted_at is null;

drop trigger if exists task_categories_set_updated_at on public.task_categories;
create trigger task_categories_set_updated_at
  before update on public.task_categories
  for each row execute function public.set_updated_at();

-- Seed the starter set (admin can rename/add/reorder later).
insert into public.task_categories (name, chip_class, sort_order)
select v.name, v.chip_class, v.sort_order
from (values
  ('Maintenance', 'rsd-chip-warn',    10),
  ('Event',       'rsd-chip-accent',  20),
  ('General',     'rsd-chip-mute',    30)
) as v(name, chip_class, sort_order)
where not exists (
  select 1 from public.task_categories tc
  where lower(tc.name) = lower(v.name) and tc.deleted_at is null
);

-- Category FK on tasks; backfill every existing row to Maintenance.
alter table public.maintenance_requests
  add column if not exists category_id uuid references public.task_categories(id);

create index if not exists maintenance_requests_category_idx
  on public.maintenance_requests (category_id) where deleted_at is null;

update public.maintenance_requests mr
set category_id = tc.id
from public.task_categories tc
where mr.category_id is null and tc.name = 'Maintenance' and tc.deleted_at is null;

-- RLS — same shape as event_categories: all authenticated read active, staff
-- edit, super-admin deletes.
alter table public.task_categories enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'task_categories'
  loop
    execute format('drop policy if exists %I on public.task_categories', r.policyname);
  end loop;
end $$;

create policy "task_categories_select_active" on public.task_categories
  for select to authenticated using (deleted_at is null);
create policy "task_categories_select_deleted_super" on public.task_categories
  for select to authenticated using (deleted_at is not null and public.is_super_admin());
create policy "task_categories_insert_staff" on public.task_categories
  for insert to authenticated with check (public.is_staff());
create policy "task_categories_update_staff" on public.task_categories
  for update to authenticated using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);
create policy "task_categories_update_super" on public.task_categories
  for update to authenticated using (public.is_super_admin())
  with check (public.is_super_admin());
create policy "task_categories_delete_super" on public.task_categories
  for delete to authenticated using (public.is_super_admin());

commit;
