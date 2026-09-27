-- 0019_directory_relationships_select.sql
--
-- Opens member_relationships read access from staff-only to all approved
-- members. The original 0017 policy was deliberately staff-only with a
-- comment "approved-member directory access comes later via either a
-- directory page or a permissive read policy" — this is that later.
--
-- Adds a new SECURITY DEFINER helper `is_approved()` that mirrors
-- `is_staff()` / `is_super_admin()`. It checks status='approved' regardless
-- of role, so members, admins, and super-admins (who are all 'approved' in
-- practice) all pass.
--
-- Write access (insert/delete) stays super-admin only — relationship
-- structure is managed from /portal/settings.
--
-- Depends on 0001 (members.role + is_super_admin), 0017 (member_relationships).

begin;

-- 1. Approval helper. Used by directory-related RLS and by future
--    approved-member-only features.
create or replace function public.is_approved()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select status = 'approved'
       from public.members where user_id = auth.uid()),
    false
  )
$$;

grant execute on function public.is_approved() to authenticated;

-- 2. Replace the staff-only SELECT policy with an approved-only one.
drop policy if exists "member_relationships_select_staff" on public.member_relationships;

create policy "member_relationships_select_approved" on public.member_relationships
  for select to authenticated
  using (public.is_approved());

commit;
