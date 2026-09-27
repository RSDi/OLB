-- 0088_member_firewall_service_role.sql
--
-- Lets the service-role backend through the members column firewall. The
-- firewall (last version 0073) returned early only for super-admins, and
-- is_super_admin() reads auth.uid(), which is null under the service key. So
-- every service-role UPDATE that touched a pinned column was rejected, and
-- resolveMembership never looked at the error:
--   - the ADMIN_EMAILS bootstrap of an existing row (role, status), so anyone
--     who signed up before being added to ADMIN_EMAILS was never promoted;
--   - linking a row a super-admin pre-created to its sign-in (user_id), so
--     that person signed in and was left without access;
--   - home-Slack auto-approval of a pending member (status).
-- Service-role INSERTs were never affected; the trigger is BEFORE UPDATE.
--
-- This adds the service-role early return guard_member_privilege_changes
-- (0058) already has. This function is SECURITY DEFINER, so current_user
-- inside it is the owner, but current_setting('role') still reports the
-- caller's role, so the same check works here. Signed-in users get exactly
-- the checks they got before.
--
-- Depends on 0073 (the firewall). Apply via the Supabase SQL editor.
-- Idempotent.

begin;

-- Reassert the column firewall (verbatim from 0073) with the service-role
-- early return added.
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
     and not public.is_staff()
  then
    raise exception 'Only the building committee can change member status';
  end if;

  return new;
end
$$;

commit;
