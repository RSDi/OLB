-- Building-shutdown wizard, Phase 2b: shutdowns become assignable Tasks worked
-- by a "Building Shutdown" volunteer team.
--
-- A shutdown task is a maintenance_requests row linked to its source event
-- (event_id) and assigned to a team member. The assignee finds it in their own
-- task queue, runs the checklist from the task page, and completion marks it
-- done + posts the event-linked FYI. A lead who can't cover hits opt-out, which
-- unassigns the task and asks the team for cover.
begin;

-- 1. Link a task to its source event. on delete set null so deleting an event
--    just orphans the task harmlessly (mirrors events.source_ticket_id).
alter table public.maintenance_requests
  add column if not exists event_id uuid references public.events(id) on delete set null;

create index if not exists maintenance_requests_event_idx
  on public.maintenance_requests (event_id) where deleted_at is null;

-- 2. Let assignees see the task assigned to them — not just ones they
--    submitted — so shutdown volunteers (regular members) find their task in
--    their queue. assigned_to is a members.id; map it from auth.uid().
drop policy if exists "maintenance_select_assignee" on public.maintenance_requests;
create policy "maintenance_select_assignee" on public.maintenance_requests
  for select to authenticated
  using (
    deleted_at is null
    and assigned_to in (
      select id from public.members
      where user_id = auth.uid() and deleted_at is null
    )
  );

-- 3. The Building Shutdown volunteer team + its two leads (seeded by name so
--    this is idempotent and not tied to environment-specific member ids).
insert into public.volunteer_teams (name, description, chip_class)
values (
  'Building Shutdown',
  'Closes the building after events — runs the shutdown checklist.',
  'rsd-chip-accent'
)
on conflict (name) do nothing;

insert into public.member_volunteer_teams (member_id, team_id, role)
select m.id, t.id, 'lead'
from public.members m
cross join public.volunteer_teams t
where t.name = 'Building Shutdown'
  and m.full_name in ('Jason Michael Backens', 'Blake Anthony Sutton')
  and m.deleted_at is null
on conflict (member_id, team_id) do update set role = 'lead';

-- 4. A category for shutdown tasks (partial unique index on lower(name), so
--    guard with NOT EXISTS rather than ON CONFLICT).
insert into public.task_categories (name, chip_class, sort_order)
select 'Building Shutdown', 'rsd-chip-accent', 50
where not exists (
  select 1 from public.task_categories
  where lower(name) = 'building shutdown' and deleted_at is null
);

commit;
