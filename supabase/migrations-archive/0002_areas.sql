-- 0002_areas.sql
--
-- Areas are the building zones a maintenance request applies to
-- (replaces the hardcoded LOCATIONS list in the assistance form).
-- Admins can add/rename; super-admins can soft-delete and restore.
--
-- Depends on 0001 (is_staff(), is_super_admin()).
--
-- Apply via the Supabase SQL editor. Idempotent.

begin;

create table if not exists public.areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Case-insensitive uniqueness on the active set. Re-creating "Nursery" after
-- soft-deleting it is allowed (the old row is excluded by the partial index).
create unique index if not exists areas_name_active_uniq
  on public.areas (lower(name))
  where deleted_at is null;

create index if not exists areas_sort_idx
  on public.areas (sort_order, name)
  where deleted_at is null;

-- Seed with the values currently hardcoded in
-- app/(site)/assistance/maintenance/page.tsx. NOT EXISTS makes this safe to
-- re-run and avoids ON CONFLICT inference against a partial index.
insert into public.areas (name, sort_order)
select v.name, v.sort_order
from (values
  ('Main Meeting Room',  10),
  ('Nursery',            20),
  ('Youth Room',         30),
  ('Children''s Wing',   40),
  ('Offices',            50),
  ('Kitchen',            60),
  ('Restrooms',          70),
  ('Parking Lot',        80),
  ('Exterior / Grounds', 90),
  ('Other',             999)
) as v(name, sort_order)
where not exists (
  select 1 from public.areas a
  where lower(a.name) = lower(v.name) and a.deleted_at is null
);

-- RLS
alter table public.areas enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'areas'
  loop
    execute format('drop policy if exists %I on public.areas', r.policyname);
  end loop;
end $$;

-- Anyone (including the public submission form) reads non-deleted areas.
create policy "areas_select_active" on public.areas
  for select to anon, authenticated
  using (deleted_at is null);

-- Super-admins also see the deleted bin.
create policy "areas_select_deleted_super" on public.areas
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

-- Staff (admin + super_admin) can add new areas.
create policy "areas_insert_staff" on public.areas
  for insert to authenticated
  with check (public.is_staff());

-- Staff can edit non-deleted areas but cannot soft-delete them — the
-- with-check forces deleted_at to stay null. Super-admins go through the
-- broader policy below.
create policy "areas_update_staff" on public.areas
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "areas_update_super" on public.areas
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "areas_delete_super" on public.areas
  for delete to authenticated
  using (public.is_super_admin());

commit;
