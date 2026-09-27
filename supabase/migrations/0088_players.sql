-- 0088_players.sql
--
-- The Directory becomes the season's players and their parents, loaded from
-- the registration spreadsheet (scripts/import-registrations.ts).
--
-- Parents are ordinary members rows, pre-created as approved with their
-- registration email and no login yet. When a parent signs up (Request access)
-- or signs in with that email, resolveMembership links the row to their new
-- login, so they land in the portal already approved.
--
-- Players are not portal users, so they get their own table rather than
-- members rows:
--
--   players          one row per registered player, with every field from the
--                    registration form (team, birthdate, address, the player's
--                    own phone/email, fee tier, payment, waiver, shirt size).
--   player_parents   player <-> parent member, with the relationship
--                    (father / mother / guardian). Siblings share parents.
--
-- members gets one new profile column, volunteer_interests, for the form's
-- "interested in serving Omaha Lightning" answer. It's the parent's own
-- answer, so like phone and address a parent can edit it on their own row.
--
-- Access: any approved member (or staff) can read players and links, as with
-- the old directory; only super-admins write. The import uses the service
-- role. Helper calls are wrapped in (select …) per 0080/0085/0086.
--
-- Linking a parent's login: resolveMembership sets user_id on the pre-created
-- row through the service role, but the members column firewall (latest in
-- 0073) only let super-admins change user_id, and the service role isn't one,
-- so the link failed and the parent's row stayed without a login. The
-- firewall now lets the service role through, as guard_member_privilege_changes
-- already does. The service role bypasses RLS anyway, so this adds no power it
-- didn't have; signed-in members are held to the same columns as before.
--
-- Apply via the Supabase SQL editor. Idempotent.

begin;

alter table public.members
  add column if not exists volunteer_interests text;

create table if not exists public.players (
  id                uuid primary key default gen_random_uuid(),
  season            text not null,
  team              text,
  first_name        text not null,
  last_name         text not null,
  birthdate         date,
  new_to_program    boolean not null default false,
  address_line1     text,
  address_line2     text,
  city              text,
  state             text,
  postal_code       text,
  phone             text,
  email             text,
  registration_fee  text,
  payment_method    text,
  shirt_size        text,
  waiver_signed     boolean not null default false,
  waiver_signed_on  date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The import matches a re-run's rows on season + name + birthdate.
create unique index if not exists players_season_identity_uniq
  on public.players (season, lower(first_name), lower(last_name), birthdate);

create index if not exists players_season_team_idx
  on public.players (season, team);

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

create table if not exists public.player_parents (
  player_id     uuid not null references public.players(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  relationship  text not null,
  created_at    timestamptz not null default now(),
  primary key (player_id, member_id),
  constraint player_parents_relationship_check
    check (relationship in ('father', 'mother', 'guardian'))
);

create index if not exists player_parents_member_idx
  on public.player_parents (member_id);

alter table public.players enable row level security;
alter table public.player_parents enable row level security;

drop policy if exists "players_select_approved" on public.players;
create policy "players_select_approved" on public.players
  for select to authenticated
  using ((select public.is_approved()) or (select public.is_staff()));

drop policy if exists "players_insert_super" on public.players;
create policy "players_insert_super" on public.players
  for insert to authenticated
  with check ((select public.is_super_admin()));

drop policy if exists "players_update_super" on public.players;
create policy "players_update_super" on public.players
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists "players_delete_super" on public.players;
create policy "players_delete_super" on public.players
  for delete to authenticated
  using ((select public.is_super_admin()));

drop policy if exists "player_parents_select_approved" on public.player_parents;
create policy "player_parents_select_approved" on public.player_parents
  for select to authenticated
  using ((select public.is_approved()) or (select public.is_staff()));

drop policy if exists "player_parents_insert_super" on public.player_parents;
create policy "player_parents_insert_super" on public.player_parents
  for insert to authenticated
  with check ((select public.is_super_admin()));

drop policy if exists "player_parents_delete_super" on public.player_parents;
create policy "player_parents_delete_super" on public.player_parents
  for delete to authenticated
  using ((select public.is_super_admin()));

-- The column firewall, verbatim from 0073 plus the service-role pass.
create or replace function public.members_enforce_self_update_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted backend (service key): linking a login, the registration import.
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
