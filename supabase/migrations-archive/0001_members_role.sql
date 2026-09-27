-- 0001_members_role.sql
--
-- Replaces members.is_admin (boolean) with members.role (text-as-enum).
-- Adds SECURITY DEFINER helper functions (is_staff, is_super_admin) used
-- by downstream RLS policies in later migrations.
--
-- Apply via the Supabase SQL editor. Idempotent.

begin;

-- 1. Drop existing policies on members so the column drop below can't break
--    against a policy that references is_admin. We recreate the policies at
--    the bottom using the new role column.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'members'
  loop
    execute format('drop policy if exists %I on public.members', r.policyname);
  end loop;
end $$;

-- 2. Add role column (nullable for backfill).
alter table public.members
  add column if not exists role text;

-- 3. Backfill. Every current is_admin=true row is an env-bootstrapped
--    super-admin (Jeff, David at time of writing) — promote them. Everyone
--    else stays a regular member.
--
--    Guarded so re-runs don't trip on the already-dropped column (PG parses
--    the UPDATE before executing, so a plain `update ... is_admin ...` would
--    fail even if role is already populated).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'members'
      and column_name = 'is_admin'
  ) then
    execute $sql$
      update public.members
      set role = case
        when coalesce(is_admin, false) then 'super_admin'
        else 'member'
      end
      where role is null
    $sql$;
  else
    -- is_admin already gone — make sure no row is left without a role.
    update public.members set role = 'member' where role is null;
  end if;
end $$;

-- 4. Lock the column down.
alter table public.members
  alter column role set default 'member',
  alter column role set not null;

alter table public.members
  drop constraint if exists members_role_check;

alter table public.members
  add constraint members_role_check
    check (role in ('member','admin','super_admin'));

-- 5. Drop the old boolean.
alter table public.members
  drop column if exists is_admin;

-- 6. Helper functions used by every downstream RLS policy.
--    SECURITY DEFINER so they can read members regardless of the caller's
--    own row-level access. search_path is pinned to avoid hijacking.
create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role in ('admin','super_admin')
       from public.members where user_id = auth.uid()),
    false
  )
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin'
       from public.members where user_id = auth.uid()),
    false
  )
$$;

-- Generic updated_at trigger function used by maintenance_requests and
-- ticket_comments. Defined here (alongside the other shared helpers) so
-- later migrations can reference it without needing their own copy.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- 7. Recreate RLS on members.
alter table public.members enable row level security;

-- Every signed-in user can read their own row. resolve-membership and the
-- sidebar both rely on this.
create policy "members_self_select" on public.members
  for select to authenticated
  using (user_id = auth.uid());

-- Staff can read all members (for the approval queue and, later, area
-- ownership assignment).
create policy "members_staff_select_all" on public.members
  for select to authenticated
  using (public.is_staff());

-- A brand-new signed-in user inserts their own pending row. The check
-- prevents one user from creating a row for another.
create policy "members_self_insert" on public.members
  for insert to authenticated
  with check (user_id = auth.uid());

-- Only super-admins approve/deny/promote. Building-committee admins manage
-- areas and tickets but never the membership list itself.
create policy "members_super_update" on public.members
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "members_super_delete" on public.members
  for delete to authenticated
  using (public.is_super_admin());

commit;
