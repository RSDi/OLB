-- 0015_event_categories.sql
--
-- Promote event categories from free text on each row to a managed lookup
-- table — admins can rename, pick colors, and reorder them from Settings →
-- Event Categories.
--
-- Seeds the lookup from whatever categories already exist as text on events
-- (case-insensitively de-duplicated, name normalized to Title Case), maps
-- each to a sensible default chip color, then adds events.category_id FK and
-- backfills it. The original events.category text column is kept (nullable)
-- for one deploy as a safety net; a follow-up migration will drop it once
-- the UI is confirmed to no longer read from it.
--
-- Depends on 0001 (is_staff, is_super_admin, set_updated_at), 0013 (events).

begin;

-- 1. Table.
create table if not exists public.event_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  chip_class  text not null default 'rsd-chip-mute',
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists event_categories_name_active_uniq
  on public.event_categories (lower(name))
  where deleted_at is null;

create index if not exists event_categories_sort_idx
  on public.event_categories (sort_order, name)
  where deleted_at is null;

drop trigger if exists event_categories_set_updated_at on public.event_categories;
create trigger event_categories_set_updated_at
  before update on public.event_categories
  for each row execute function public.set_updated_at();

-- 2. Seed from distinct existing event categories. Maps known names to the
--    chip color the UI was hardcoded to use. Anything not in the map gets
--    the mute (neutral) chip.
insert into public.event_categories (name, chip_class, sort_order)
select
  initcap(c)        as name,
  case lower(c)
    when 'worship'  then 'rsd-chip-accent'
    when 'youth'    then 'rsd-chip-success'
    when 'study'    then 'rsd-chip-accent'
    when 'admin'    then 'rsd-chip-mute'
    when 'outreach' then 'rsd-chip-warn'
    else 'rsd-chip-mute'
  end                as chip_class,
  case lower(c)
    when 'worship'  then 10
    when 'study'    then 20
    when 'youth'    then 30
    when 'outreach' then 40
    when 'admin'    then 50
    else 100
  end                as sort_order
from (
  select distinct trim(category) as c
  from public.events
  where category is not null and deleted_at is null
) src
where length(c) > 0
  and not exists (
    select 1 from public.event_categories ec
    where lower(ec.name) = lower(c) and ec.deleted_at is null
  );

-- 3. FK column on events.
alter table public.events
  add column if not exists category_id uuid references public.event_categories(id);

create index if not exists events_category_id_active_idx
  on public.events (category_id)
  where deleted_at is null;

-- 4. Backfill events.category_id from events.category text.
update public.events e
set category_id = ec.id
from public.event_categories ec
where e.category_id is null
  and e.category is not null
  and lower(ec.name) = lower(trim(e.category))
  and ec.deleted_at is null;

-- 5. RLS — same shape as priorities: everyone reads non-deleted, staff edit,
--    super-admin deletes.
alter table public.event_categories enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'event_categories'
  loop
    execute format('drop policy if exists %I on public.event_categories', r.policyname);
  end loop;
end $$;

create policy "event_categories_select_active" on public.event_categories
  for select to authenticated
  using (deleted_at is null);

create policy "event_categories_select_deleted_super" on public.event_categories
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "event_categories_insert_staff" on public.event_categories
  for insert to authenticated
  with check (public.is_staff());

create policy "event_categories_update_staff" on public.event_categories
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "event_categories_update_super" on public.event_categories
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "event_categories_delete_super" on public.event_categories
  for delete to authenticated
  using (public.is_super_admin());

commit;
