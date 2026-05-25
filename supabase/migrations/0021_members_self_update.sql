-- 0021_members_self_update.sql
--
-- Lets a member edit their own directory entry — full_name, phone, birthday,
-- avatar_url — without going through a super-admin.
--
-- RLS gates WHICH ROW you can update. A BEFORE UPDATE trigger gates WHICH
-- COLUMNS, since Postgres RLS WITH CHECK can't restrict column-level edits
-- directly. The trigger short-circuits for super-admins (their existing
-- members_super_update policy already permits arbitrary changes); for
-- self-edits by non-super-admins it raises if anything outside the allowed
-- column set changed.
--
-- The existing members_super_update policy (from 0001) and members_self_select
-- policy stay intact. Two permissive UPDATE policies are OR'd by Postgres,
-- so super-admin row management is unaffected.
--
-- Depends on 0001 (members RLS + is_super_admin) and 0017 (phone/birthday
-- columns).

begin;

-- 1. Self-update policy. USING restricts row targeting to your own row;
--    WITH CHECK ensures the patch doesn't reassign user_id away from you.
drop policy if exists "members_self_update" on public.members;

create policy "members_self_update" on public.members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2. Column-restriction trigger. Fires before any UPDATE; if the caller
--    isn't a super-admin, only the directory-editable fields may change.
create or replace function public.members_enforce_self_update_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Super-admins bypass entirely — their UPDATE goes through
  -- members_super_update and they're expected to change role/status/etc.
  if public.is_super_admin() then
    return new;
  end if;

  -- Any other path is a self-update. Lock down everything except the
  -- four directory-editable columns. Use IS DISTINCT FROM so NULL <-> NULL
  -- doesn't trip the check.
  if new.id           is distinct from old.id
     or new.user_id      is distinct from old.user_id
     or new.email        is distinct from old.email
     or new.role         is distinct from old.role
     or new.status       is distinct from old.status
     or new.requested_at is distinct from old.requested_at
     or new.reviewed_at  is distinct from old.reviewed_at
     or new.reviewed_by  is distinct from old.reviewed_by
  then
    raise exception 'Only super-admins can change role, status, email, or review fields';
  end if;

  return new;
end
$$;

drop trigger if exists members_enforce_self_update_columns on public.members;

create trigger members_enforce_self_update_columns
  before update on public.members
  for each row
  execute function public.members_enforce_self_update_columns();

commit;
