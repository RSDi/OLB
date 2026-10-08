-- 0122_access_profiles.sql
--
-- Access profiles: named bundles of permissions a super-admin hands out in one
-- step, set up in Settings → Access Profiles.
--
--   access_profiles               one row per profile. `base_role` is
--                                 'member' or 'admin' (Board): a person on a
--                                 Board-based profile is Board and keeps every
--                                 built-in board power (is_staff()). The two
--                                 built-in profiles, Member and Board, can't
--                                 be deleted or change base; a super-admin
--                                 edits what they include.
--   access_profiles.permissions   the permission keys the profile gives (see
--                                 PERMISSIONS in lib/auth/access.ts).
--   members.access_profile_id     the person's profile. Null means the
--                                 built-in profile for their role, so new
--                                 sign-ups and everyone before this migration
--                                 need no backfill. Setting it sets the
--                                 person's role to the profile's base.
--   members.extra_permissions     permissions given to this one person on
--                                 top of their profile.
--
-- Profiles are live: change a profile and everyone on it changes. A person's
-- permissions are their profile's plus their extras. Super-admins hold every
-- permission and have no profile.
--
-- has_permission(key) is now the one check; the existing per-grant helpers
-- (can_manage_finances() and the rest) call it, so every policy that uses
-- them keeps working unchanged. The old can_* columns are copied into
-- extra_permissions below and no longer read. They stay for now so a rollback
-- to the previous app still sees them; a later migration drops them.
--
-- Helper calls in policies are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0121. Idempotent.

begin;

-- ─── Profiles ───────────────────────────────────────────────────────────────

create table if not exists public.access_profiles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  base_role   text not null check (base_role in ('member', 'admin')),
  permissions text[] not null default '{}',
  is_builtin  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists access_profiles_name_key
  on public.access_profiles (lower(btrim(name)));
-- One built-in profile per base: the profile for people with no profile set.
create unique index if not exists access_profiles_builtin_key
  on public.access_profiles (base_role) where is_builtin;

insert into public.access_profiles (name, base_role, is_builtin)
values ('Member', 'member', true), ('Board', 'admin', true)
on conflict do nothing;

alter table public.access_profiles enable row level security;

drop policy if exists "access_profiles_staff_select" on public.access_profiles;
create policy "access_profiles_staff_select" on public.access_profiles
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "access_profiles_super_insert" on public.access_profiles;
create policy "access_profiles_super_insert" on public.access_profiles
  for insert to authenticated
  with check ((select public.is_super_admin()) and not is_builtin);

drop policy if exists "access_profiles_super_update" on public.access_profiles;
create policy "access_profiles_super_update" on public.access_profiles
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists "access_profiles_super_delete" on public.access_profiles;
create policy "access_profiles_super_delete" on public.access_profiles
  for delete to authenticated
  using ((select public.is_super_admin()) and not is_builtin);

grant select, insert, update, delete on public.access_profiles to authenticated;

-- A built-in profile keeps its base and stays built-in; a profile's base
-- change carries to everyone on it (profiles are live).
create or replace function public.access_profiles_before_update()
returns trigger
language plpgsql
as $$
begin
  if old.is_builtin and (new.base_role is distinct from old.base_role
                         or not new.is_builtin) then
    raise exception 'The built-in Member and Board profiles keep their base';
  end if;
  if not old.is_builtin and new.is_builtin then
    raise exception 'A profile can''t be made built-in';
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists access_profiles_before_update on public.access_profiles;
create trigger access_profiles_before_update
  before update on public.access_profiles
  for each row execute function public.access_profiles_before_update();

create or replace function public.access_profiles_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.base_role is distinct from old.base_role then
    update public.members
       set role = new.base_role
     where access_profile_id = new.id
       and role <> 'super_admin';
  end if;
  return null;
end
$$;

drop trigger if exists access_profiles_after_update on public.access_profiles;
create trigger access_profiles_after_update
  after update on public.access_profiles
  for each row execute function public.access_profiles_after_update();

-- ─── Each member's profile and extras ───────────────────────────────────────

alter table public.members
  add column if not exists access_profile_id uuid
    references public.access_profiles (id) on delete set null,
  add column if not exists extra_permissions text[] not null default '{}';

create index if not exists members_access_profile_id_idx
  on public.members (access_profile_id);

-- The old grant columns become extras, once (a re-run finds them already
-- there). Super-admins hold everything, so they need none.
update public.members m
   set extra_permissions = array(
         select distinct unnest(m.extra_permissions || array_remove(array[
           case when m.can_manage_finances      then 'payments'          end,
           case when m.can_manage_registrations then 'registrations'     end,
           case when m.can_manage_travel        then 'travel'            end,
           case when m.can_slack_dm             then 'slack_dm'          end,
           case when m.can_edit_settings        then 'settings_edit'     end,
           case when m.can_delete_settings      then 'settings_delete'   end,
           case when m.can_undelete_settings    then 'settings_undelete' end,
           case when m.can_manage_website       then 'website'           end
         ], null))
         order by 1
       )
 where m.role <> 'super_admin'
   and (m.can_manage_finances or m.can_manage_registrations or m.can_manage_travel
        or m.can_slack_dm or m.can_edit_settings or m.can_delete_settings
        or m.can_undelete_settings or m.can_manage_website);

-- A person's role follows their profile's base. Super-admins have no profile
-- and no extras.
create or replace function public.members_sync_access_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
begin
  if new.role = 'super_admin' then
    new.access_profile_id := null;
    new.extra_permissions := '{}';
  elsif new.access_profile_id is not null
        and (tg_op = 'INSERT' or new.access_profile_id is distinct from old.access_profile_id) then
    select ap.base_role into base from public.access_profiles ap where ap.id = new.access_profile_id;
    if base is not null then
      new.role := base;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists members_sync_access_profile on public.members;
create trigger members_sync_access_profile
  before insert or update on public.members
  for each row execute function public.members_sync_access_profile();

-- Only a super-admin (or the server) may change a role, profile or grant.
-- 0120's version with the profile and extras added.
create or replace function public.guard_member_privilege_changes()
returns trigger
language plpgsql
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
       or new.access_profile_id is distinct from old.access_profile_id
       or new.extra_permissions is distinct from old.extra_permissions
       or new.can_edit_settings is distinct from old.can_edit_settings
       or new.can_delete_settings is distinct from old.can_delete_settings
       or new.can_undelete_settings is distinct from old.can_undelete_settings
       or new.can_manage_finances is distinct from old.can_manage_finances
       or new.can_manage_registrations is distinct from old.can_manage_registrations
       or new.can_manage_travel is distinct from old.can_manage_travel
       or new.can_slack_dm is distinct from old.can_slack_dm
       or new.can_manage_website is distinct from old.can_manage_website then
      raise exception 'Only a super-admin can change a member''s role or settings grants';
    end if;
  elsif tg_op = 'INSERT' then
    if new.role <> 'member'
       or new.access_profile_id is not null
       or cardinality(new.extra_permissions) > 0
       or new.can_edit_settings
       or new.can_delete_settings
       or new.can_undelete_settings
       or new.can_manage_finances
       or new.can_manage_registrations
       or new.can_manage_travel
       or new.can_slack_dm
       or new.can_manage_website then
      raise exception 'Only a super-admin can create a member with a role or settings grants';
    end if;
  end if;

  return new;
end
$$;

-- ─── The check ──────────────────────────────────────────────────────────────

-- The signed-in person's permissions: their profile's (or the built-in one
-- for their role) plus their extras. Super-admins hold every permission;
-- callers check for them first. Mirrors lib/auth/access.ts.
create or replace function public.my_permissions()
returns text[]
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select array(
             select distinct unnest(m.extra_permissions || coalesce(ap.permissions, '{}'))
             order by 1
           )
      from public.members m
      left join public.access_profiles ap
        on ap.id = coalesce(
             m.access_profile_id,
             (select b.id from public.access_profiles b
               where b.is_builtin and b.base_role = m.role))
     where m.user_id = auth.uid()
       and m.deleted_at is null
       and m.status = 'approved'
  ), '{}')
$$;

revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated, service_role;

create or replace function public.has_permission(p text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select m.status = 'approved'
           and (m.role = 'super_admin' or p = any(public.my_permissions()))
      from public.members m
     where m.user_id = auth.uid()
       and m.deleted_at is null
  ), false)
$$;

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated, service_role;

-- ─── The existing grant helpers, now on has_permission ──────────────────────
-- Same names and meaning, so every policy using them is untouched.

create or replace function public.can_manage_finances()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_permission('payments') $$;

create or replace function public.can_manage_registrations()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_permission('registrations') $$;

create or replace function public.can_manage_travel()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_permission('travel') $$;

create or replace function public.can_slack_dm()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_permission('slack_dm') $$;

-- Board-only permissions: they count only for Board (or a super-admin).
create or replace function public.can_manage_website()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() and public.has_permission('website') $$;

create or replace function public.can_edit_settings()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() and public.has_permission('settings_edit') $$;

create or replace function public.can_delete_settings()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() and public.has_permission('settings_delete') $$;

create or replace function public.can_undelete_settings()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() and public.has_permission('settings_undelete') $$;

create or replace function public.can_manage_settings()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.can_edit_settings() or public.can_delete_settings() or public.can_undelete_settings()
$$;

commit;
