-- 0005_maintenance_requests_v2.sql
--
-- Extends maintenance_requests for the new ticketing model:
--   - area_id    FK to areas (backfilled from the existing `location` text)
--   - priority_id FK to priorities (backfilled from the existing `priority` key)
--   - status     open | in_progress | done | cancelled
--   - assigned_to FK to members.id
--   - deleted_at  soft delete
--   - updated_at  maintained by trigger
--
-- The old `location` and `priority` text columns are kept (nullable) for
-- this deploy as a safety net. A follow-up migration drops them once we
-- confirm the UI no longer reads from them.
--
-- Depends on 0001 (is_staff, is_super_admin), 0002 (areas), 0003 (priorities).

begin;

-- The shared set_updated_at() trigger function lives in 0001.

-- 1. Reconcile pre-existing schema:
--    a) The original table named the submitter column `user_id`. The
--       assistance form has always sent `submitted_by`, so submits have
--       been silently failing. Rename to match — safe because the table
--       is empty.
--    b) The original column had no FK to auth.users. Add one (ON DELETE
--       SET NULL so deleting the user doesn't take their tickets with it).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maintenance_requests'
      and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maintenance_requests'
      and column_name = 'submitted_by'
  ) then
    alter table public.maintenance_requests
      rename column user_id to submitted_by;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.maintenance_requests'::regclass
      and conname = 'maintenance_requests_submitted_by_fkey'
  ) then
    alter table public.maintenance_requests
      add constraint maintenance_requests_submitted_by_fkey
        foreign key (submitted_by) references auth.users(id)
        on delete set null;
  end if;
end $$;

-- 2. New columns. Each is conditional so re-running is safe.
alter table public.maintenance_requests
  add column if not exists area_id     uuid references public.areas(id),
  add column if not exists priority_id uuid references public.priorities(id),
  add column if not exists status      text not null default 'open',
  add column if not exists assigned_to uuid references public.members(id),
  add column if not exists deleted_at  timestamptz,
  add column if not exists updated_at  timestamptz not null default now();

alter table public.maintenance_requests
  drop constraint if exists maintenance_requests_status_check;

alter table public.maintenance_requests
  add constraint maintenance_requests_status_check
  check (status in ('open','in_progress','done','cancelled'));

-- 3. Indexes that the queue UI will lean on.
create index if not exists maintenance_requests_status_idx
  on public.maintenance_requests (status)
  where deleted_at is null;

create index if not exists maintenance_requests_area_idx
  on public.maintenance_requests (area_id)
  where deleted_at is null;

create index if not exists maintenance_requests_assigned_idx
  on public.maintenance_requests (assigned_to)
  where deleted_at is null;

create index if not exists maintenance_requests_submitter_idx
  on public.maintenance_requests (submitted_by)
  where deleted_at is null;

-- 4. updated_at trigger (function defined in 0001).
drop trigger if exists maintenance_requests_set_updated_at
  on public.maintenance_requests;

create trigger maintenance_requests_set_updated_at
  before update on public.maintenance_requests
  for each row execute function public.set_updated_at();

-- 5. Backfill area_id from the old `location` text. Matched case-insensitively
--    against the active area set. Rows whose location doesn't match an area
--    are left null; the staff queue UI will surface those for cleanup.
update public.maintenance_requests mr
set area_id = a.id
from public.areas a
where mr.area_id is null
  and mr.location is not null
  and lower(a.name) = lower(mr.location)
  and a.deleted_at is null;

-- 6. Backfill priority_id from the old `priority` text (which already held
--    the key: low/medium/high/emergency).
update public.maintenance_requests mr
set priority_id = p.id
from public.priorities p
where mr.priority_id is null
  and mr.priority is not null
  and p.key = mr.priority
  and p.deleted_at is null;

-- 7. RLS — replace whatever exists on the table with the comprehensive set.
alter table public.maintenance_requests enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'maintenance_requests'
  loop
    execute format('drop policy if exists %I on public.maintenance_requests', r.policyname);
  end loop;
end $$;

-- INSERT: anyone can submit (the public form still accepts anonymous).
--   When submitted_by is set, it must match the caller. This prevents one
--   user from submitting on behalf of someone else.
create policy "maintenance_insert" on public.maintenance_requests
  for insert to anon, authenticated
  with check (
    submitted_by is null
    or submitted_by = auth.uid()
    or public.is_staff()
  );

-- SELECT: submitter sees own non-deleted; staff see all non-deleted;
--   super-admin sees deleted too.
create policy "maintenance_select_self" on public.maintenance_requests
  for select to authenticated
  using (deleted_at is null and submitted_by = auth.uid());

create policy "maintenance_select_staff" on public.maintenance_requests
  for select to authenticated
  using (deleted_at is null and public.is_staff());

create policy "maintenance_select_deleted_super" on public.maintenance_requests
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

-- UPDATE: staff edit non-deleted rows but cannot soft-delete them via the
--   staff policy. Super-admins can do anything.
create policy "maintenance_update_staff" on public.maintenance_requests
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "maintenance_update_super" on public.maintenance_requests
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Hard delete: super-admins only.
create policy "maintenance_delete_super" on public.maintenance_requests
  for delete to authenticated
  using (public.is_super_admin());

commit;
