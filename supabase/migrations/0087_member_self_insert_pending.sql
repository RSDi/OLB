-- 0087_member_self_insert_pending.sql
--
-- members_self_insert (0001) is for the one row a brand-new signed-in user
-- creates for themselves: the pending access request resolveMembership
-- inserts at first sign-in, sending { user_id, email, full_name, avatar_url }
-- and leaving every other column to its default. Its check pinned the row to
-- the caller; it now pins the rest of that request too, as 0001 intended:
--   - email is the caller's sign-in email, the email claim in their token,
--     compared case-insensitively. members.email is unique, so a row can't
--     take an address that belongs to someone else;
--   - status is 'pending', nothing is reviewed yet, and requested_at is its
--     default (now() is the transaction start time, as the default is);
--   - role, the settings grants, the admin-managed directory and access
--     columns, and things_enabled are at their defaults. Apart from
--     things_enabled (a per-user preference that starts off), these are the
--     columns members_enforce_self_update_columns and
--     guard_member_privilege_changes reserve for the committee or
--     super-admins on UPDATE.
-- Profile fields (full_name, avatar_url, phone, address, ...) stay open, as
-- they are on UPDATE. A committee member approves or denies the request as
-- before.
--
-- Super-admins insert through members_super_insert (0018), and the service
-- role (ADMIN_EMAILS bootstrap, home-Slack sign-ins, the directory import)
-- bypasses RLS, so neither changes.
--
-- auth.uid() and auth.jwt() are wrapped in subqueries so they run once per
-- statement, as in 0080/0085/0086. Depends on 0064 (things_enabled) and 0073
-- (access_revoked_at). Apply via the Supabase SQL editor. Idempotent.

begin;

drop policy if exists "members_self_insert" on public.members;

create policy "members_self_insert" on public.members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and lower(email) = lower((select auth.jwt() ->> 'email'))
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
    and requested_at = now()
    and role = 'member'
    and not can_edit_settings
    and not can_delete_settings
    and not can_undelete_settings
    and directory_category = 'regular'
    and membership_status = 'regular'
    and joined_at is null
    and baptism_at is null
    and deceased_at is null
    and not wiffleball_opt_out
    and not things_enabled
    and access_revoked_at is null
    and deleted_at is null
  );

commit;
