-- 0045_projects.sql
--
-- Reframe Phase 2: Projects group Tasks. A project ("Plan cigar night") is a
-- named container; tasks point at it via maintenance_requests.project_id
-- (nullable — standalone tasks have none). RLS mirrors maintenance_requests:
-- the creator + staff see active rows, staff edit, super-admin hard-deletes.
--
-- Depends on 0001 (is_staff/is_super_admin/set_updated_at), 0005
-- (maintenance_requests), 0044 (task_categories).

begin;

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  category_id uuid references public.task_categories(id),
  status      text not null default 'active'
              check (status in ('active', 'done', 'archived')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists projects_status_idx
  on public.projects (status, created_at desc) where deleted_at is null;
create index if not exists projects_creator_idx
  on public.projects (created_by) where deleted_at is null;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.maintenance_requests
  add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists maintenance_requests_project_idx
  on public.maintenance_requests (project_id) where deleted_at is null;

-- RLS — mirrors maintenance_requests.
alter table public.projects enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'projects'
  loop
    execute format('drop policy if exists %I on public.projects', r.policyname);
  end loop;
end $$;

create policy "projects_select_self" on public.projects
  for select to authenticated
  using (created_by = auth.uid() and deleted_at is null);
create policy "projects_select_staff" on public.projects
  for select to authenticated
  using (public.is_staff() and deleted_at is null);
create policy "projects_select_deleted_super" on public.projects
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());
create policy "projects_insert" on public.projects
  for insert to authenticated
  with check (created_by = auth.uid() or public.is_staff());
create policy "projects_update_staff" on public.projects
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);
create policy "projects_update_super" on public.projects
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
create policy "projects_delete_super" on public.projects
  for delete to authenticated
  using (public.is_super_admin());

commit;
