-- 0022_member_directory_fields.sql
--
-- Adds the columns the spreadsheet import (Luann's MCC-2026.xlsx) needs, plus
-- the few extras we agreed on for directory management:
--
--   address           text  — single-line postal address from the sheet
--   home_phone        text  — landline; usually only on the household head
--   nickname          text  — parsed from "Edward (Ed)" patterns
--   anniversary       date  — denormalized on both spouses (same value)
--   deceased_at       date  — only set on directory_category='memorial' rows
--   directory_category enum-as-text — regular / extended / memorial
--   membership_status  enum-as-text — visiting / regular / moved / inactive
--   joined_at         date  — first attended OLB
--   baptism_at        date
--   wiffleball_opt_out boolean — for kids whose parents don't want them playing
--
-- directory_category is distinct from membership_status:
--   directory_category = which directory section a row lives in (the sheet
--   already partitions the world into Attend / Extended / Asleep)
--   membership_status = where this person stands as an OLB attender today
--
-- Notes are deliberately NOT on this table — they belong in a staff-only
-- sub-table (0023) so the members_directory_select policy from 0020 doesn't
-- leak private context to all approved members.
--
-- Depends on 0001 (members table).

begin;

alter table public.members
  add column if not exists address text,
  add column if not exists home_phone text,
  add column if not exists nickname text,
  add column if not exists anniversary date,
  add column if not exists deceased_at date,
  add column if not exists directory_category text not null default 'regular',
  add column if not exists membership_status text not null default 'regular',
  add column if not exists joined_at date,
  add column if not exists baptism_at date,
  add column if not exists wiffleball_opt_out boolean not null default false;

alter table public.members
  drop constraint if exists members_directory_category_check;
alter table public.members
  add constraint members_directory_category_check
    check (directory_category in ('regular', 'extended', 'memorial'));

alter table public.members
  drop constraint if exists members_membership_status_check;
alter table public.members
  add constraint members_membership_status_check
    check (membership_status in ('visiting', 'regular', 'moved', 'inactive'));

-- Memorial rows must have deceased_at; non-memorial rows must not.
alter table public.members
  drop constraint if exists members_memorial_deceased_check;
alter table public.members
  add constraint members_memorial_deceased_check
    check (
      (directory_category = 'memorial' and deceased_at is not null)
      or (directory_category <> 'memorial' and deceased_at is null)
    );

-- The self-update trigger from 0021 lists the columns a member can change on
-- their own row. Extend it so members can also edit their address, home
-- phone, nickname, and anniversary. Membership status, joined/baptism dates,
-- directory_category, deceased_at, and wiffleball_opt_out stay super-admin
-- only — those are pastoral / administrative concerns.
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
  then
    raise exception 'Only super-admins can change role, status, email, or admin-managed directory fields';
  end if;

  return new;
end
$$;

commit;
