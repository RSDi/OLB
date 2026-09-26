-- 0072_consolidate_settings_routing.sql
--
-- Consolidates the Settings tabs: the standalone "Assignments" concept
-- (area_members = members tagged owner/helper of a building area) is folded
-- into volunteer teams. Each area now points at ONE responsible team via
-- areas.responsible_team_id; when a maintenance ticket is filed for that area,
-- the team's members (leads = old "owner", members = old "helper") are emailed.
--
-- After this migration the app no longer reads area_members. The routing
-- rewrite in lib/notifications/new-ticket.ts MUST ship in the same release, or
-- area owners silently stop being notified (super-admins still are).
--
-- UI rename note (no DB change): "Areas" stays the building zones (this table);
-- "Volunteer Teams" is relabeled "Teams" in the UI only — table names unchanged.
--
-- Depends on 0001 (is_staff), 0002 (areas), 0004 (area_members), 0036
-- (volunteer_teams + member_volunteer_teams).
--
-- Apply via the Supabase SQL editor. TRANSACTION 1 is idempotent and safe to
-- re-run. TRANSACTION 2 (the drop) is destructive — run it only after the
-- verification query below shows the backfill is complete.

-- ============================================================================
-- TRANSACTION 1 — add the routing link + migrate existing assignments
-- ============================================================================
begin;

-- 1. The routing link: each area -> the team responsible for it. Nullable
--    (null = super-admins only, matching the old graceful fallback). Deleting
--    a team must never cascade-delete a building area, so SET NULL.
alter table public.areas
  add column if not exists responsible_team_id uuid
    references public.volunteer_teams(id) on delete set null;

create index if not exists areas_responsible_team_idx
  on public.areas (responsible_team_id)
  where deleted_at is null;

-- 2. Faithful per-area migration of area_members -> teams. For each active area
--    that currently has owners/helpers, ensure a team named after it exists,
--    link the area to it, and copy the people across (owner->lead, helper->member).

-- 2a. One team per active area that has assignments. Reuse a same-named team
--     (case-insensitive) rather than duplicate; volunteer_teams.name is UNIQUE.
insert into public.volunteer_teams (name, description, chip_class)
select a.name, 'Migrated from area assignments', 'rsd-chip-mute'
from public.areas a
where a.deleted_at is null
  and exists (select 1 from public.area_members am where am.area_id = a.id)
  and not exists (
    select 1 from public.volunteer_teams t where lower(t.name) = lower(a.name)
  )
on conflict (name) do nothing;

-- 2b. Link each such area to its team (match by name).
update public.areas a
set responsible_team_id = t.id
from public.volunteer_teams t
where a.deleted_at is null
  and a.responsible_team_id is null
  and lower(t.name) = lower(a.name)
  and exists (select 1 from public.area_members am where am.area_id = a.id);

-- 2c. Copy assignments into team membership. owner->lead, helper->member.
--     If the member is already on the team, keep 'lead' if either side is lead.
insert into public.member_volunteer_teams (member_id, team_id, role)
select am.member_id,
       a.responsible_team_id,
       case when am.role = 'owner' then 'lead' else 'member' end
from public.area_members am
join public.areas a on a.id = am.area_id
where a.responsible_team_id is not null
on conflict (member_id, team_id) do update
  set role = case
    when public.member_volunteer_teams.role = 'lead' or excluded.role = 'lead'
      then 'lead'
    else 'member'
  end;

commit;

-- ============================================================================
-- VERIFICATION — run this and confirm the counts before TRANSACTION 2.
-- Expect: every (area-with-owners, member) pair now exists as a team
-- membership. `unmigrated` should be 0.
-- ============================================================================
-- select
--   (select count(*) from public.area_members am
--      join public.areas a on a.id = am.area_id
--      where a.deleted_at is null and a.responsible_team_id is null) as unmigrated,
--   (select count(*) from public.area_members) as old_assignments,
--   (select count(*) from public.member_volunteer_teams) as team_memberships;

-- ============================================================================
-- TRANSACTION 2 — drop the old entity (DESTRUCTIVE). Run after verifying above.
-- Its indexes and RLS policies drop with the table. Nothing in the DB
-- references area_members (search_global joins areas, not area_members).
-- ============================================================================
begin;

drop table if exists public.area_members;

commit;
