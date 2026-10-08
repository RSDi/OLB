-- 0123_grantable_board_powers.sql
--
-- More permissions for access profiles (0122), so a super-admin can give
-- someone who isn't Board one Board power at a time, or a power that was
-- super-admin only.
--
-- Board powers, now also grantable (Board keeps every one, automatically):
--   see_all_players      every player, listed or not, with fees, waivers,
--                        shirts and parents' sign-up status and "Can help"
--   member_notes         the private Member notes on profiles
--   player_requirements  checking players off on requirements
--   approve_members      the access-request queue: approve, deny, restore
--   contacts_edit        External Contacts: see all, add, edit, history
--   hs_schedule          planning the HS Schedule (Board and coaches already)
--
-- Super-admin powers, now also grantable:
--   teams                Settings → Teams and Volunteer Roles, and filling
--                        team spots. Whoever fills a leadership spot makes
--                        that person a coach (is_coach(), 0108).
--   site_links           Settings → Sidebar Links and Public Directory
--
-- Every change is "Board (or super-admin) OR has_permission(...)": the
-- existing policies stay as they are and new permissive policies sit beside
-- them, so nobody loses anything. Each power gets a helper, can_<power>(),
-- that the policies and the app call.
--
-- Helper calls in policies are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0122. Idempotent.

begin;

-- ─── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.can_see_all_players()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() or public.has_permission('see_all_players') $$;

create or replace function public.can_member_notes()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() or public.has_permission('member_notes') $$;

create or replace function public.can_check_requirements()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() or public.has_permission('player_requirements') $$;

create or replace function public.can_approve_members()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() or public.has_permission('approve_members') $$;

create or replace function public.can_edit_contacts()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() or public.has_permission('contacts_edit') $$;

create or replace function public.can_manage_teams()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_super_admin() or public.has_permission('teams') $$;

create or replace function public.can_manage_site_links()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_super_admin() or public.has_permission('site_links') $$;

-- 0108's planner check, plus the permission.
create or replace function public.can_plan_hs_schedule()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() or public.is_coach() or public.has_permission('hs_schedule') $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'can_see_all_players', 'can_member_notes', 'can_check_requirements', 'can_approve_members',
    'can_edit_contacts', 'can_manage_teams', 'can_manage_site_links'
  ] loop
    execute format('revoke all on function public.%I() from public, anon', f);
    execute format('grant execute on function public.%I() to authenticated, service_role', f);
  end loop;
end
$$;

-- ─── see_all_players ────────────────────────────────────────────────────────
-- Players' parent links and the parents' member rows follow player
-- visibility already (0090, 0091), so this one policy carries them.

drop policy if exists "olb_players_all_players_select" on public.olb_players;
create policy "olb_players_all_players_select" on public.olb_players
  for select to authenticated
  using ((select public.can_see_all_players()));

-- ─── member_notes ───────────────────────────────────────────────────────────

drop policy if exists "members_notes_select_granted" on public.members_notes;
create policy "members_notes_select_granted" on public.members_notes
  for select to authenticated
  using ((select public.can_member_notes()));

drop policy if exists "members_notes_insert_granted" on public.members_notes;
create policy "members_notes_insert_granted" on public.members_notes
  for insert to authenticated
  with check ((select public.can_member_notes()));

drop policy if exists "members_notes_update_granted" on public.members_notes;
create policy "members_notes_update_granted" on public.members_notes
  for update to authenticated
  using ((select public.can_member_notes()))
  with check ((select public.can_member_notes()));

-- ─── player_requirements ────────────────────────────────────────────────────
-- Checking players off, and the files attached when you do. Setting the
-- requirements up stays with Settings: Edit.

drop policy if exists "olb_requirements_select_granted" on public.olb_requirements;
create policy "olb_requirements_select_granted" on public.olb_requirements
  for select to authenticated
  using ((select public.can_check_requirements()));

drop policy if exists "olb_player_requirements_granted_all" on public.olb_player_requirements;
create policy "olb_player_requirements_granted_all" on public.olb_player_requirements
  for all to authenticated
  using ((select public.can_check_requirements()))
  with check ((select public.can_check_requirements()));

drop policy if exists "player_requirement_files_select_granted" on storage.objects;
create policy "player_requirement_files_select_granted" on storage.objects
  for select to authenticated
  using (bucket_id = 'player-requirement-files' and (select public.can_check_requirements()));

drop policy if exists "player_requirement_files_insert_granted" on storage.objects;
create policy "player_requirement_files_insert_granted" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-requirement-files' and (select public.can_check_requirements()));

drop policy if exists "player_requirement_files_update_granted" on storage.objects;
create policy "player_requirement_files_update_granted" on storage.objects
  for update to authenticated
  using (bucket_id = 'player-requirement-files' and (select public.can_check_requirements()))
  with check (bucket_id = 'player-requirement-files' and (select public.can_check_requirements()));

drop policy if exists "player_requirement_files_delete_granted" on storage.objects;
create policy "player_requirement_files_delete_granted" on storage.objects
  for delete to authenticated
  using (bucket_id = 'player-requirement-files' and (select public.can_check_requirements()));

-- ─── approve_members ────────────────────────────────────────────────────────
-- The queue: everyone not approved yet (approved members are readable by any
-- approved member already). A holder who isn't Board reviews through
-- review_member(), which writes only the status, so they get no general
-- update on member rows. They review members only, not Board.

drop policy if exists "members_approver_select" on public.members;
create policy "members_approver_select" on public.members
  for select to authenticated
  using (deleted_at is null and status <> 'approved' and (select public.can_approve_members()));

create or replace function public.review_member(p_member_id uuid, p_status text)
returns table (id uuid, user_id uuid, email text, full_name text, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_approve_members() then
    raise exception 'Only the board, or someone allowed to approve access requests, can review them';
  end if;
  if p_status not in ('pending', 'approved', 'denied') then
    raise exception 'Unknown status %', p_status;
  end if;
  return query
    update public.members m
       set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
     where m.id = p_member_id
       and m.deleted_at is null
       and (public.is_staff() or m.role = 'member')
    returning m.id, m.user_id, m.email, m.full_name, m.status;
end
$$;

revoke all on function public.review_member(uuid, text) from public, anon;
grant execute on function public.review_member(uuid, text) to authenticated;

-- 0096's column guard, with status changes open to approvers too.
create or replace function public.members_enforce_self_update_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted backend (service key) and super-admins may change anything.
  if coalesce(current_setting('role', true), '') = 'service_role' then
    return new;
  end if;
  if public.is_super_admin() then
    return new;
  end if;

  if new.id                  is distinct from old.id
     or new.user_id             is distinct from old.user_id
     or new.email               is distinct from old.email
     or new.role                is distinct from old.role
     or new.requested_at        is distinct from old.requested_at
     or new.directory_category  is distinct from old.directory_category
     or new.membership_status   is distinct from old.membership_status
     or new.joined_at           is distinct from old.joined_at
     or new.baptism_at          is distinct from old.baptism_at
     or new.deceased_at         is distinct from old.deceased_at
     or new.wiffleball_opt_out  is distinct from old.wiffleball_opt_out
     or new.access_revoked_at   is distinct from old.access_revoked_at
     or new.deleted_at          is distinct from old.deleted_at
  then
    raise exception 'Only super-admins can change role, email, deletion, or admin-managed directory fields';
  end if;

  if (new.status      is distinct from old.status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by)
     and not public.can_approve_members()
  then
    raise exception 'Only the board can change member status';
  end if;

  return new;
end
$$;

-- ─── contacts_edit ──────────────────────────────────────────────────────────
-- Seeing every contact and type, adding, editing and the history. Deleting
-- and restoring stay with super-admins; links to tasks and playbooks stay
-- with the board.

drop policy if exists "contacts_select_editor" on public.contacts;
create policy "contacts_select_editor" on public.contacts
  for select to authenticated
  using (deleted_at is null and (select public.can_edit_contacts()));

drop policy if exists "contacts_insert_editor" on public.contacts;
create policy "contacts_insert_editor" on public.contacts
  for insert to authenticated
  with check (deleted_at is null and (select public.can_edit_contacts()));

drop policy if exists "contacts_update_editor" on public.contacts;
create policy "contacts_update_editor" on public.contacts
  for update to authenticated
  using (deleted_at is null and (select public.can_edit_contacts()))
  with check (deleted_at is null and (select public.can_edit_contacts()));

drop policy if exists "contact_categories_select_editor" on public.contact_categories;
create policy "contact_categories_select_editor" on public.contact_categories
  for select to authenticated
  using (deleted_at is null and (select public.can_edit_contacts()));

drop policy if exists "contact_versions_select_editor" on public.contact_versions;
create policy "contact_versions_select_editor" on public.contact_versions
  for select to authenticated
  using ((select public.can_edit_contacts()));

-- ─── teams ──────────────────────────────────────────────────────────────────

drop policy if exists "olb_teams_teams_all" on public.olb_teams;
create policy "olb_teams_teams_all" on public.olb_teams
  for all to authenticated
  using ((select public.can_manage_teams()))
  with check ((select public.can_manage_teams()));

drop policy if exists "olb_volunteer_roles_teams_all" on public.olb_volunteer_roles;
create policy "olb_volunteer_roles_teams_all" on public.olb_volunteer_roles
  for all to authenticated
  using ((select public.can_manage_teams()))
  with check ((select public.can_manage_teams()));

drop policy if exists "olb_team_volunteers_teams_all" on public.olb_team_volunteers;
create policy "olb_team_volunteers_teams_all" on public.olb_team_volunteers
  for all to authenticated
  using ((select public.can_manage_teams()))
  with check ((select public.can_manage_teams()));

-- ─── site_links ─────────────────────────────────────────────────────────────
-- Public Directory's key table has no policies (0119): the app writes it
-- with the service key after checking can_manage_site_links().

drop policy if exists "sidebar_links_site_links_all" on public.sidebar_links;
create policy "sidebar_links_site_links_all" on public.sidebar_links
  for all to authenticated
  using ((select public.can_manage_site_links()))
  with check ((select public.can_manage_site_links()));

commit;
