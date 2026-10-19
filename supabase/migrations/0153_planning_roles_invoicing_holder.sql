-- 0153_planning_roles_invoicing_holder.sql
--
-- Jeff 10/19 11:05 AM CT (QA F1): Board must not change Held by on
-- President / Athletic Director / Treasurer (those grant invoicing).
-- members.role is member | admin | super_admin; admin is Board (0096).
-- There is no separate admin role, so this is super-admin only.
-- Name, chip and order on those rows stay Board-editable. Other planning
-- roles stay fully Board-editable. Idempotent.
--
-- Server-side writes are allowed the same way 0123's
-- members_enforce_self_update_columns does: service_role, plus
-- auth.uid() IS NULL (postgres SQL editor, migrations). Re-running 0104's
-- INSERT … ON CONFLICT DO NOTHING would otherwise fail because this
-- trigger fires before the unique check. anon has no write grant, so
-- unsigned-in API callers cannot write. Signed-in Board members still
-- have auth.uid() set and are blocked.

begin;

create or replace function public.planning_roles_invoicing_holder_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  keys text[] := array['role:president', 'role:athletic_director', 'role:treasurer'];
  old_key text;
  new_key text;
  sensitive boolean := false;
begin
  -- Trusted backend (service key), SQL editor, and migrations.
  if coalesce(current_setting('role', true), '') = 'service_role'
     or auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  old_key := case when tg_op = 'INSERT' then null else old.seed_key end;
  new_key := case when tg_op = 'DELETE' then null else new.seed_key end;

  if tg_op = 'INSERT' then
    sensitive := new_key = any (keys);
  elsif tg_op = 'DELETE' then
    sensitive := old_key = any (keys);
  else
    if coalesce(old_key, '') = any (keys) or coalesce(new_key, '') = any (keys) then
      if old.member_id is distinct from new.member_id
         or old.seed_key is distinct from new.seed_key
         or old.deleted_at is distinct from new.deleted_at then
        sensitive := true;
      end if;
    end if;
  end if;

  if sensitive and not (select public.is_super_admin()) then
    raise exception 'Only a super-admin can change who holds President, Athletic Director, or Treasurer.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists planning_roles_invoicing_holder_guard on public.planning_roles;
create trigger planning_roles_invoicing_holder_guard
  before insert or update or delete on public.planning_roles
  for each row execute function public.planning_roles_invoicing_holder_guard();

revoke all on function public.planning_roles_invoicing_holder_guard() from public, anon;

commit;
