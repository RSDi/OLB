-- 0008_pm.sql
--
-- Phase 2 MVP: Preventative Maintenance.
--
-- `pm_templates` defines a recurring task — title, description, target area,
-- default priority, schedule, and an ordered checklist of sub-steps. Templates
-- are managed by staff in /portal/pm/templates.
--
-- `pm_instances` are concrete occurrences spun off from a template. Each
-- instance has its own status (pending / in_progress / done / skipped),
-- per-step completion tracking (step_checks jsonb), completion timestamp, and
-- optional notes. Title/description/area/priority/steps are copied at
-- creation time so subsequent template edits don't retroactively rewrite
-- history.
--
-- Schedule kinds (single-int value column to keep editing simple):
--   monthly_day            — day-of-month, 1-28
--   weekly_day             — day-of-week, 0=Sun..6=Sat
--   after_completion_days  — N days after the previous instance was completed
--
-- Depends on 0001 (is_staff, is_super_admin, set_updated_at), 0002 (areas),
-- 0003 (priorities).

begin;

create table if not exists public.pm_templates (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  area_id       uuid references public.areas(id),
  priority_id   uuid references public.priorities(id),
  schedule_kind text not null,
  schedule_value int not null,
  steps         jsonb not null default '[]'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint pm_templates_schedule_kind_check
    check (schedule_kind in ('monthly_day','weekly_day','after_completion_days')),
  constraint pm_templates_schedule_value_check
    check (
      (schedule_kind = 'monthly_day'           and schedule_value between 1 and 28) or
      (schedule_kind = 'weekly_day'            and schedule_value between 0 and 6)  or
      (schedule_kind = 'after_completion_days' and schedule_value between 1 and 3650)
    )
);

create index if not exists pm_templates_active_idx
  on public.pm_templates (active, title)
  where deleted_at is null;

drop trigger if exists pm_templates_set_updated_at on public.pm_templates;
create trigger pm_templates_set_updated_at
  before update on public.pm_templates
  for each row execute function public.set_updated_at();

create table if not exists public.pm_instances (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.pm_templates(id) on delete cascade,
  title           text not null,
  description     text,
  area_id         uuid references public.areas(id),
  priority_id     uuid references public.priorities(id),
  scheduled_for   date not null,
  status          text not null default 'pending',
  step_checks     jsonb not null default '[]'::jsonb,
  notes           text,
  completed_at    timestamptz,
  completed_by    uuid references public.members(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint pm_instances_status_check
    check (status in ('pending','in_progress','done','skipped'))
);

create index if not exists pm_instances_status_idx
  on public.pm_instances (status, scheduled_for)
  where deleted_at is null;

create index if not exists pm_instances_template_idx
  on public.pm_instances (template_id, scheduled_for desc);

create index if not exists pm_instances_area_idx
  on public.pm_instances (area_id)
  where deleted_at is null;

drop trigger if exists pm_instances_set_updated_at on public.pm_instances;
create trigger pm_instances_set_updated_at
  before update on public.pm_instances
  for each row execute function public.set_updated_at();

-- RLS
alter table public.pm_templates enable row level security;
alter table public.pm_instances enable row level security;

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('pm_templates','pm_instances')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Templates: staff can read non-deleted; super-admins also see deleted.
create policy "pm_templates_select_staff" on public.pm_templates
  for select to authenticated
  using (deleted_at is null and public.is_staff());

create policy "pm_templates_select_deleted_super" on public.pm_templates
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

-- Staff can create + edit non-deleted templates. Staff cannot soft-delete via
-- this policy (with_check forces deleted_at to stay null) — super-admins do
-- that via the broader policy below.
create policy "pm_templates_insert_staff" on public.pm_templates
  for insert to authenticated
  with check (public.is_staff());

create policy "pm_templates_update_staff" on public.pm_templates
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "pm_templates_update_super" on public.pm_templates
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "pm_templates_delete_super" on public.pm_templates
  for delete to authenticated
  using (public.is_super_admin());

-- Instances: staff can read non-deleted; super-admins see deleted too.
create policy "pm_instances_select_staff" on public.pm_instances
  for select to authenticated
  using (deleted_at is null and public.is_staff());

create policy "pm_instances_select_deleted_super" on public.pm_instances
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

-- Staff can generate + work instances.
create policy "pm_instances_insert_staff" on public.pm_instances
  for insert to authenticated
  with check (public.is_staff());

create policy "pm_instances_update_staff" on public.pm_instances
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "pm_instances_update_super" on public.pm_instances
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "pm_instances_delete_super" on public.pm_instances
  for delete to authenticated
  using (public.is_super_admin());

commit;
