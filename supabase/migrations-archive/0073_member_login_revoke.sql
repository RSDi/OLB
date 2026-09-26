-- 0073_member_login_revoke.sql
--
-- Decouples "has an email" from "can sign in". A super-admin can now revoke a
-- member's portal login (e.g. they left the church) WITHOUT removing their
-- directory entry or email: the app bans their auth account and stamps
-- access_revoked_at. The directory keeps showing them (with contact info);
-- they just can't log in. Reversible (restore = un-ban + clear the stamp).
--
-- access_revoked_at is a super-admin-only field, so it joins the identity /
-- role / directory columns already pinned in the column-firewall trigger
-- (latest version was 0050). resolveMembership also denies a revoked member
-- defensively, in case the ban is ever bypassed.
--
-- Depends on 0001 (is_staff, is_super_admin), 0022/0050 (the firewall trigger).
-- Apply via the Supabase SQL editor. Idempotent.

begin;

alter table public.members
  add column if not exists access_revoked_at timestamptz;

-- Reassert the column firewall (verbatim from 0050) with access_revoked_at
-- added to the super-admin-only set.
create or replace function public.members_enforce_self_update_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
