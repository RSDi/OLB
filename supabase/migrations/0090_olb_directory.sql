-- 0090_olb_directory.sql
--
-- The Directory becomes the season's players and their parents, on the same
-- player records the Team manager (0089) uses. A registration, whether from
-- the spreadsheet import (scripts/import-registrations.ts) or approved from
-- the public form, fills in the player's registration details and links the
-- player to their parents.
--
-- Parents are ordinary members rows, pre-created as approved with their
-- registration email and no login. When a parent signs up or signs in with
-- that email, resolveMembership links the row to their login (0088 lets the
-- service role do that), so they land in the portal already approved.
--
--   olb_players         gains every registration field: age group (from the
--                       spreadsheet's 10U/12U/… sections), address, the
--                       player's own phone/email, fee tier, payment, shirt
--                       size, waiver, "first season" and the form's "add me
--                       to the Omaha Lightning Directory?" answer.
--                       registered_at marks a player who came from a
--                       registration, so a roster re-import keeps them.
--   olb_player_parents  player <-> parent member (father / mother / guardian).
--                       Siblings share parents.
--   members             gains volunteer_interests, the parent's answer to
--                       "interested in serving Omaha Lightning". It's the
--                       parent's own answer, so like phone and address a
--                       parent can edit it on their own row.
--
-- Access. Super-admins keep read/write on every olb_ table (0089's
-- <table>_super_all policies). The Directory adds reads:
--   - staff (Building Committee and super-admins) read every player;
--   - approved members read the players whose family said yes to the
--     directory, and their parent links;
--   - approved members and staff read teams and seasons, for the team names.
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0088 and 0089. Idempotent.

begin;

alter table public.members
  add column if not exists volunteer_interests text;

alter table public.olb_players
  add column if not exists age_group         text,
  add column if not exists new_to_program    boolean not null default false,
  add column if not exists address_line1     text,
  add column if not exists address_line2     text,
  add column if not exists city              text,
  add column if not exists state             text,
  add column if not exists postal_code       text,
  add column if not exists phone             text,
  add column if not exists email             text,
  add column if not exists registration_fee  text,
  add column if not exists payment_method    text,
  add column if not exists shirt_size        text,
  add column if not exists waiver_signed     boolean not null default false,
  add column if not exists waiver_signed_on  date,
  add column if not exists directory_optin   boolean not null default true,
  add column if not exists registered_at     timestamptz;

create table if not exists public.olb_player_parents (
  player_id     uuid not null references public.olb_players(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  relationship  text not null,
  created_at    timestamptz not null default now(),
  primary key (player_id, member_id),
  constraint olb_player_parents_relationship_check
    check (relationship in ('father', 'mother', 'guardian'))
);

create index if not exists olb_player_parents_member_idx
  on public.olb_player_parents (member_id);

alter table public.olb_player_parents enable row level security;

drop policy if exists "olb_player_parents_super_all" on public.olb_player_parents;
create policy "olb_player_parents_super_all" on public.olb_player_parents
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- A link is visible when its player is: the subquery runs under the caller's
-- olb_players policies, so an opted-out player's parents stay hidden too.
drop policy if exists "olb_player_parents_directory_select" on public.olb_player_parents;
create policy "olb_player_parents_directory_select" on public.olb_player_parents
  for select to authenticated
  using (exists (select 1 from public.olb_players p where p.id = player_id));

drop policy if exists "olb_players_directory_select" on public.olb_players;
create policy "olb_players_directory_select" on public.olb_players
  for select to authenticated
  using ((select public.is_staff()) or ((select public.is_approved()) and directory_optin));

drop policy if exists "olb_teams_directory_select" on public.olb_teams;
create policy "olb_teams_directory_select" on public.olb_teams
  for select to authenticated
  using ((select public.is_approved()) or (select public.is_staff()));

drop policy if exists "olb_boards_directory_select" on public.olb_boards;
create policy "olb_boards_directory_select" on public.olb_boards
  for select to authenticated
  using ((select public.is_approved()) or (select public.is_staff()));

commit;
