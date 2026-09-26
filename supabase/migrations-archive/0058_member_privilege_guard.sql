-- 0058: guard member role + settings-grant changes.
--
-- The members UPDATE policy lets any committee member (is_staff) write any
-- member row, so without this a no-grant admin could grant themselves settings
-- capabilities — or change roles — via a direct API call, bypassing the UI.
-- This BEFORE INSERT/UPDATE trigger pins role + the three grant columns to
-- super-admins (and the service-role backend).
--
-- Deliberately does NOT guard `status` — committee members approve/deny the
-- member queue. New-signup inserts (role 'member', no grants) are allowed.
-- Idempotent.

create or replace function public.guard_member_privilege_changes()
returns trigger
language plpgsql
-- SECURITY INVOKER (default): current_setting('role') reflects the CALLER, so
-- service-role backend writes (bootstrap, orphan-link) are detected + allowed.
as $$
begin
  -- Trusted backend (service key) and super-admins may change anything.
  if coalesce(current_setting('role', true), '') = 'service_role' then
    return new;
  end if;
  if public.is_super_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       or new.can_edit_settings is distinct from old.can_edit_settings
       or new.can_delete_settings is distinct from old.can_delete_settings
       or new.can_undelete_settings is distinct from old.can_undelete_settings then
      raise exception 'Only a super-admin can change a member''s role or settings grants';
    end if;
  elsif tg_op = 'INSERT' then
    if new.role <> 'member'
       or new.can_edit_settings
       or new.can_delete_settings
       or new.can_undelete_settings then
      raise exception 'Only a super-admin can create a member with a role or settings grants';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_member_privilege_changes on public.members;
create trigger guard_member_privilege_changes
  before insert or update on public.members
  for each row execute function public.guard_member_privilege_changes();
