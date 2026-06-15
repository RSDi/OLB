-- 0068_tasks_subtasks_merge.sql
--
-- Merge "Task" and "Project" into one self-referential concept.
--
-- Until now a Project was a separate `projects` row and a Task pointed at it
-- via maintenance_requests.project_id. This migration makes a Task able to
-- contain other Tasks: a task with children IS a "project". One level only
-- (children do not nest further — enforced in app logic, not the schema).
--
-- What it does:
--   1. Add maintenance_requests.parent_id (self-FK) + budget; add
--      reel_notes_action_items.task_id (durable link from a voice-note action
--      item to the sub-task it spawned).
--   2. Add owns_task(uuid) — a SECURITY DEFINER helper (mirrors is_staff) so
--      the new member RLS policies can reference maintenance_requests without
--      tripping recursive-policy errors (42P17).
--   3. Migrate every live project into a parent task: project.title becomes the
--      first line of the task description (tasks have no title column — line 1
--      is the title everywhere), status is mapped, budget carried, created as
--      review_status='approved'. Each project's child tasks are re-pointed from
--      project_id onto the new parent_id.
--   4. RLS: tighten the INSERT policy so a member can only attach a sub-task to
--      their OWN parent task (staff may attach anywhere); add a SELECT policy so
--      a member can see all sub-tasks under a parent they own.
--
-- The `projects` table and the (now-vestigial) maintenance_requests.project_id
-- column are intentionally LEFT IN PLACE as a safety net; a later migration
-- drops them once the merged model is verified in production. The new parent
-- rows keep project_id populated as a provenance + idempotency key (see below).
--
-- DEPLOY NOTE: apply this together with the matching app deploy. With the
-- migration applied but old code still running, the retired project detail
-- page would show an empty task list (children now hang off parent_id), so
-- don't leave the two out of step.
--
-- Idempotent; safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. New columns.
-- ---------------------------------------------------------------------------

alter table public.maintenance_requests
  add column if not exists parent_id uuid references public.maintenance_requests(id) on delete set null,
  add column if not exists budget    numeric(10,2);

-- A sub-task's parent. ON DELETE SET NULL = the safe default (detach to a
-- standalone task). Cascade-deleting children is done in app code so the user
-- can be prompted at delete time (delete the project's sub-tasks too, or keep
-- them as standalone tasks).
create index if not exists maintenance_requests_parent_idx
  on public.maintenance_requests (parent_id)
  where deleted_at is null;

-- Durable link: when a recorded note's action item is turned into a sub-task,
-- stamp the resulting task here so we never duplicate it and can navigate
-- between the item and its task. SET NULL so removing the task doesn't delete
-- the source action item.
alter table public.reel_notes_action_items
  add column if not exists task_id uuid references public.maintenance_requests(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. owns_task(): does the caller own (submit) the given live task?
--    SECURITY DEFINER so the policies below can read maintenance_requests
--    without re-entering RLS on that same table.
-- ---------------------------------------------------------------------------

create or replace function public.owns_task(p_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select submitted_by = auth.uid()
       from public.maintenance_requests
      where id = p_id
        and deleted_at is null),
    false
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Migrate projects -> parent tasks, re-point their children.
--
--    One statement so the old project id correlates to the new task id via
--    RETURNING. The new parent row is inserted WITH project_id = p.id — this
--    doubles as (a) the join key for re-pointing children and (b) the
--    idempotency guard (NOT EXISTS below), and is left populated afterwards as
--    provenance. Children get project_id nulled; the parent keeps it.
-- ---------------------------------------------------------------------------

with ins as (
  insert into public.maintenance_requests
    (description, status, review_status, submitted_by, budget, category_id, project_id, created_at)
  select
    p.title || case when coalesce(p.description, '') <> '' then E'\n\n' || p.description else '' end,
    case p.status
      when 'active'   then 'open'
      when 'done'     then 'done'
      when 'archived' then 'done'   -- archived = completed-and-filed, not abandoned
      else 'open'
    end,
    'approved',
    p.created_by,
    p.budget,
    p.category_id,
    p.id,            -- stash old project id: join key + idempotency key + provenance
    p.created_at
  from public.projects p
  where p.deleted_at is null
    and not exists (
      select 1 from public.maintenance_requests m
      where m.project_id = p.id
        and m.parent_id is null
    )
  returning id as new_parent, project_id as old_proj
)
update public.maintenance_requests c
   set parent_id  = ins.new_parent,
       project_id = null
  from ins
 where c.project_id = ins.old_proj
   and c.id <> ins.new_parent     -- never re-parent the new parent onto itself
   and c.parent_id is null;       -- only touch not-yet-parented rows (re-run safe)

-- ---------------------------------------------------------------------------
-- 4. RLS for sub-tasks.
-- ---------------------------------------------------------------------------

-- INSERT: staff anywhere; a member only on a top-level task (parent_id null,
-- the normal "new task / make a request" path) or as a sub-task under a parent
-- they own. Replaces the 0049 policy (which let any approved member insert a
-- row with ANY parent_id).
drop policy if exists "maintenance_insert" on public.maintenance_requests;
create policy "maintenance_insert" on public.maintenance_requests
  for insert to authenticated
  with check (
    public.is_staff()
    or (
      submitted_by = auth.uid()
      and public.is_approved()
      and (parent_id is null or public.owns_task(parent_id))
    )
  );

-- SELECT: a member can see every sub-task that hangs off a parent they own
-- (even ones a staffer added). owns_task(null) is false, so top-level rows are
-- unaffected here — those stay covered by select_self / select_staff /
-- select_assignee.
drop policy if exists "maintenance_select_own_subtask" on public.maintenance_requests;
create policy "maintenance_select_own_subtask" on public.maintenance_requests
  for select to authenticated
  using (deleted_at is null and public.owns_task(parent_id));

commit;
