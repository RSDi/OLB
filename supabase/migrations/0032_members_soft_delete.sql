-- 0032_members_soft_delete.sql
--
-- Soft-delete support for members, mirroring the deleted_at pattern already
-- used by areas, priorities, and pm_templates.
--
-- - `deleted_at timestamptz` nullable. NULL = active, otherwise the timestamp
--   we soft-deleted at.
-- - Trigger from 0021/0022 extended so non-super-admins cannot touch
--   deleted_at (super-admins still bypass the trigger).
-- - Existing SELECT policies (self/staff/directory) restricted to active
--   rows. A new super-admin SELECT policy lets the DeletedTab read deleted
--   rows for restore.
--
-- Depends on 0001 (RLS) and 0021 (column-restriction trigger).

begin;

alter table public.members
  add column if not exists deleted_at timestamptz;

-- Update the column-restriction trigger to also forbid non-super-admins from
-- changing deleted_at. Super-admins still short-circuit at the top, so the
-- soft-delete / restore actions just work.
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
     or new.status              is distinct from old.status
     or new.requested_at        is distinct from old.requested_at
     or new.reviewed_at         is distinct from old.reviewed_at
     or new.reviewed_by         is distinct from old.reviewed_by
     or new.directory_category  is distinct from old.directory_category
     or new.membership_status   is distinct from old.membership_status
     or new.joined_at           is distinct from old.joined_at
     or new.baptism_at          is distinct from old.baptism_at
     or new.deceased_at         is distinct from old.deceased_at
     or new.wiffleball_opt_out  is distinct from old.wiffleball_opt_out
     or new.deleted_at          is distinct from old.deleted_at
  then
    raise exception 'Only super-admins can change role, status, email, deletion, or admin-managed directory fields';
  end if;

  return new;
end
$$;

-- Tighten existing SELECT policies to active rows only. Permissive policies
-- are OR'd in Postgres, so the new super-admin policy below restores
-- visibility for deleted rows when needed.
drop policy if exists "members_self_select" on public.members;
create policy "members_self_select" on public.members
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

drop policy if exists "members_staff_select_all" on public.members;
create policy "members_staff_select_all" on public.members
  for select to authenticated
  using (public.is_staff() and deleted_at is null);

drop policy if exists "members_directory_select" on public.members;
create policy "members_directory_select" on public.members
  for select to authenticated
  using (
    status = 'approved'
    and deleted_at is null
    and public.is_approved()
  );

-- Super-admins see everything, deleted or not. Powers the DeletedTab.
drop policy if exists "members_super_select_all" on public.members;
create policy "members_super_select_all" on public.members
  for select to authenticated
  using (public.is_super_admin());

commit;
