-- 0110_travel_coordinator.sql
--
-- The Travel permission: whoever books the hotel blocks and finds places to
-- eat on the road (the travel coordinator) keeps those External Contacts up
-- to date without being on the board.
--
--   members.can_manage_travel       a grant a super-admin gives in Settings →
--                                   Members (Manages: Travel). Holders read,
--                                   add and edit the contacts of the travel
--                                   types, and the people at them. Any
--                                   approved member can hold it, board or not.
--                                   Super-admins always can.
--   contact_categories.travel_kind  'hotel' or 'food': the types the travel
--                                   coordinator keeps, and the ones the HS
--                                   Schedule lists under a weekend away
--                                   (lib/hs-schedule/travel.ts). Set here,
--                                   once, for the types named Hotels and Food
--                                   (and the names the app treats as the
--                                   same); Settings → Contact Types after that.
--
-- A holder can't delete a contact or read or change any other type, and
-- contact history stays the board's. A person with no type of their own
-- follows their company's, as for coaches (0109).
--
-- Helper calls are wrapped in (select …) per AGENTS.md, except the one that
-- takes the row's columns.
--
-- Apply via the Supabase SQL editor, after 0109. Idempotent.

begin;

-- ─── The grant ──────────────────────────────────────────────────────────────

alter table public.members
  add column if not exists can_manage_travel boolean not null default false;

create or replace function public.can_manage_travel()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select m.status = 'approved' and (m.role = 'super_admin' or m.can_manage_travel)
      from public.members m
     where m.user_id = auth.uid()
       and m.deleted_at is null
  ), false)
$$;

revoke all on function public.can_manage_travel() from public, anon;
grant execute on function public.can_manage_travel() to authenticated;

-- Only a super-admin (or the server) may give or take a grant. 0102's
-- version with can_manage_travel added.
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
       or new.can_edit_settings is distinct from old.can_edit_settings
       or new.can_delete_settings is distinct from old.can_delete_settings
       or new.can_undelete_settings is distinct from old.can_undelete_settings
       or new.can_manage_finances is distinct from old.can_manage_finances
       or new.can_manage_registrations is distinct from old.can_manage_registrations
       or new.can_manage_travel is distinct from old.can_manage_travel then
      raise exception 'Only a super-admin can change a member''s role or settings grants';
    end if;
  elsif tg_op = 'INSERT' then
    if new.role <> 'member'
       or new.can_edit_settings
       or new.can_delete_settings
       or new.can_undelete_settings
       or new.can_manage_finances
       or new.can_manage_registrations
       or new.can_manage_travel then
      raise exception 'Only a super-admin can create a member with a role or settings grants';
    end if;
  end if;

  return new;
end
$$;

-- ─── Which types are travel ─────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contact_categories'
      and column_name = 'travel_kind'
  ) then
    alter table public.contact_categories
      add column travel_kind text check (travel_kind in ('hotel', 'food'));
    -- Only when the column is new, so running this again never undoes what
    -- the board has set since.
    update public.contact_categories
       set travel_kind = 'hotel'
     where deleted_at is null
       and lower(trim(name)) in ('hotels', 'hotel', 'lodging', 'hotel blocks');
    update public.contact_categories
       set travel_kind = 'food'
     where deleted_at is null
       and lower(trim(name)) in ('food', 'restaurants', 'restaurant', 'dining', 'places to eat');
  end if;
end;
$$;

-- Is this a travel contact? Its own type decides; a person with no type
-- follows their company's. Security definer so the policies below can read
-- the company without going through contacts' policies again.
create or replace function public.contact_is_travel(p_category_id uuid, p_parent_contact_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select cc.travel_kind is not null
       from public.contact_categories cc
      where cc.id = p_category_id
        and cc.deleted_at is null),
    (select cc.travel_kind is not null
       from public.contacts p
       join public.contact_categories cc on cc.id = p.category_id and cc.deleted_at is null
      where p.id = p_parent_contact_id
        and p.deleted_at is null),
    false
  )
$$;

revoke all on function public.contact_is_travel(uuid, uuid) from public, anon;
grant execute on function public.contact_is_travel(uuid, uuid) to authenticated;

-- ─── What the travel coordinator can do ─────────────────────────────────────

drop policy if exists "contacts_select_travel" on public.contacts;
create policy "contacts_select_travel" on public.contacts
  for select to authenticated
  using (
    deleted_at is null
    and (select public.can_manage_travel())
    and public.contact_is_travel(category_id, parent_contact_id)
  );

drop policy if exists "contacts_insert_travel" on public.contacts;
create policy "contacts_insert_travel" on public.contacts
  for insert to authenticated
  with check (
    deleted_at is null
    and (select public.can_manage_travel())
    and public.contact_is_travel(category_id, parent_contact_id)
  );

-- Kept to travel contacts on both sides, and never into the deleted bin.
drop policy if exists "contacts_update_travel" on public.contacts;
create policy "contacts_update_travel" on public.contacts
  for update to authenticated
  using (
    deleted_at is null
    and (select public.can_manage_travel())
    and public.contact_is_travel(category_id, parent_contact_id)
  )
  with check (
    deleted_at is null
    and (select public.can_manage_travel())
    and public.contact_is_travel(category_id, parent_contact_id)
  );

drop policy if exists "contact_categories_select_travel" on public.contact_categories;
create policy "contact_categories_select_travel" on public.contact_categories
  for select to authenticated
  using (
    deleted_at is null
    and travel_kind is not null
    and (select public.can_manage_travel())
  );

commit;

notify pgrst, 'reload schema';
