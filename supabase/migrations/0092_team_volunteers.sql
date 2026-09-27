-- 0092_team_volunteers.sql
--
-- Team staff and volunteers. Settings → Volunteer Roles defines the jobs every
-- team can fill (head coach, assistant coach, team mom, video, …) and how many
-- of each a team needs. Each team's page in the Directory assigns members to
-- them. A volunteer can be any member, not just a parent on the team.
--
--   olb_volunteer_roles   the jobs. is_leadership: holders get the Directory's
--                         age-group view, like the board. show_in_directory:
--                         shown on the team's banner in the Directory.
--                         registration_interest: the registration form's
--                         volunteer option it matches, so parents who picked
--                         it are suggested first.
--   olb_team_volunteers   one row per member in a role on a team.
--   olb_teams             gains practice_location.
--
-- Every approved member can read both tables, and the members in them
-- (members_team_volunteer_select), so a team's staff shows in the Directory
-- even when they aren't parents. Only super-admins write.
--
-- Apply via the Supabase SQL editor, after 0091. Idempotent.

begin;

alter table public.olb_teams
  add column if not exists practice_location text;

create table if not exists public.olb_volunteer_roles (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  description           text,
  spots_per_team        int  not null default 1 check (spots_per_team between 1 and 10),
  is_leadership         boolean not null default false,
  show_in_directory     boolean not null default false,
  registration_interest text,
  sort_order            int  not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create table if not exists public.olb_team_volunteers (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.olb_teams(id) on delete cascade,
  role_id     uuid not null references public.olb_volunteer_roles(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (team_id, role_id, member_id)
);

create index if not exists olb_team_volunteers_team_idx on public.olb_team_volunteers (team_id);
create index if not exists olb_team_volunteers_member_idx on public.olb_team_volunteers (member_id);

alter table public.olb_volunteer_roles enable row level security;
alter table public.olb_team_volunteers enable row level security;

drop policy if exists "olb_volunteer_roles_super_all" on public.olb_volunteer_roles;
create policy "olb_volunteer_roles_super_all" on public.olb_volunteer_roles
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists "olb_volunteer_roles_directory_select" on public.olb_volunteer_roles;
create policy "olb_volunteer_roles_directory_select" on public.olb_volunteer_roles
  for select to authenticated
  using ((select public.is_approved()) or (select public.is_staff()));

drop policy if exists "olb_team_volunteers_super_all" on public.olb_team_volunteers;
create policy "olb_team_volunteers_super_all" on public.olb_team_volunteers
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists "olb_team_volunteers_directory_select" on public.olb_team_volunteers;
create policy "olb_team_volunteers_directory_select" on public.olb_team_volunteers
  for select to authenticated
  using ((select public.is_approved()) or (select public.is_staff()));

-- A team's staff are visible to approved members even when they're pending
-- (a coach added in Settings with no login) or not a parent.
drop policy if exists "members_team_volunteer_select" on public.members;
create policy "members_team_volunteer_select" on public.members
  for select to authenticated
  using (
    deleted_at is null
    and (select public.is_approved())
    and exists (select 1 from public.olb_team_volunteers tv where tv.member_id = members.id)
  );

-- Starting roles. registration_interest matches the options on the public
-- registration form (app/(site)/player-registration/RegistrationForm.tsx).
insert into public.olb_volunteer_roles
  (name, description, spots_per_team, is_leadership, show_in_directory, registration_interest, sort_order)
select * from (values
  ('Head coach',      'Runs practices and games',                          1, true,  true,  'Coach/ Assistant Coach', 10),
  ('Assistant coach', 'Helps run practices and the bench',                 2, true,  true,  'Coach/ Assistant Coach', 20),
  ('Team mom',        'Snacks, schedules, carpools and team communication', 1, false, true,  'Team Parent (1 per Team)', 30),
  ('Video',           'Films games',                                        1, false, true,  'Game Videography (1 per team)', 40),
  ('Scorekeeper',     'Keeps the book at games',                            1, false, false, 'Team Scorekeeper/ Clock (1 or 2 per team)', 50),
  ('Clock',           'Runs the game clock',                                1, false, false, 'Team Scorekeeper/ Clock (1 or 2 per team)', 60),
  ('Photographer',    'Game photos and the end-of-season slideshow',        1, false, false, 'Game Photography/ End of Season Slideshow (1 per team)', 70)
) v(name, description, spots_per_team, is_leadership, show_in_directory, registration_interest, sort_order)
where not exists (select 1 from public.olb_volunteer_roles);

commit;
