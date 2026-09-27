-- 0091_parent_access_approval.sql
--
-- A parent from a player registration no longer gets portal access just by
-- signing up: a super-admin approves them first.
--
-- The registration import and the Team manager's Approve button now create
-- parents as pending members with no login (lib/teams/apply-registration.ts).
-- When a parent signs up with their registration email, resolveMembership
-- links their login to that row and it becomes an access request: it shows in
-- Settings → Members → Pending and the admins are notified, as for anyone
-- else asking for access. Parents who haven't signed up are listed under
-- "Not signed up" instead of the queue.
--
-- 1. Pending members are hidden from other members (members_directory_select
--    only shows approved ones), which would drop every not-yet-approved
--    parent from the Directory. This lets approved members also read a
--    member who is a parent of a player they can see. The subquery runs
--    under the caller's olb_player_parents policy, which follows
--    olb_players, so a family that opted out of the directory stays hidden.
--
-- 2. The 2026-2027 import (before this change) created its parents approved.
--    Every such parent who hasn't signed in yet goes back to pending. They're
--    picked out as: approved, no login, a parent of a player, and never
--    reviewed (a super-admin approving someone, or creating them in Settings,
--    stamps reviewed_at; the import didn't). Parents who already had an
--    account are untouched.
--
--    The members column firewall lets only staff change status, and the SQL
--    editor's postgres role isn't staff, so the update runs as service_role,
--    which the firewall and guard_member_privilege_changes let through
--    (0088). set local ends at commit.
--
-- Apply via the Supabase SQL editor, after 0090. Idempotent.

begin;

drop policy if exists "members_parent_directory_select" on public.members;
create policy "members_parent_directory_select" on public.members
  for select to authenticated
  using (
    deleted_at is null
    and (select public.is_approved())
    and exists (select 1 from public.olb_player_parents pp where pp.member_id = members.id)
  );

set local role service_role;

update public.members m
   set status = 'pending'
 where m.status = 'approved'
   and m.user_id is null
   and m.reviewed_at is null
   and m.deleted_at is null
   and m.role = 'member'
   and exists (select 1 from public.olb_player_parents pp where pp.member_id = m.id);

commit;
