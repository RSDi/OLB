-- 0108_hs_schedule.sql
--
-- HS Schedule: the high school teams' season weekend by weekend, the way the
-- "Omaha Lightning Schedule 2026-2027 Working copy for Coaches and Board"
-- spreadsheet lays it out (one "HS Schedule - 26-27" tab per season). The
-- coaches and the board plan it together, and past seasons stay to look back
-- on.
--
--   hs_seasons         one per season, named by the year it starts (2026 is
--                      2026–27), like maintenance_requests.planning_season.
--                      imported_from/imported_at: the spreadsheet tab it came
--                      from, when it did.
--   hs_levels          the season's columns: the teams we field, "V", "JV1",
--                      "JV2", "14U A"… (the spreadsheet's columns H–N), in
--                      order. name is the long form ("Varsity"). team_id links
--                      the Directory team, when there is one. hidden folds a
--                      column away, like the spreadsheet's hidden 14U and 12U.
--   hs_weekends        a row of the schedule: its dates, location, trip type,
--                      the event, its status (the spreadsheet's colors: need
--                      to secure facility, final details in process, facility
--                      secured…), notes (the venue and game times, the
--                      spreadsheet's Notes column), the Facilities contact
--                      that venue is, and details (the event's full text,
--                      when it's longer than a name).
--   hs_weekend_games   a cell in columns H–N: how many games one of our teams
--                      plays that weekend. unsure is the spreadsheet's "?"
--                      (or a count someone is on the fence about); note says
--                      more ("1–3 games").
--   hs_opponents       the teams coming, or the ones we play there: a program
--                      in External Contacts (contact_id) or just a name. name
--                      is kept either way, so the schedule reads the same for
--                      coaches, who can't open External Contacts.
--                      level_id null: coming for every team we bring; set:
--                      that team only. status: confirmed, tentative (on the
--                      fence) or declined. our_score/their_score: the result.
--
-- Who. is_coach() (new): an approved member in a leadership volunteer role
-- (Head coach, Assistant coach…, Settings → Volunteer Roles) on a team.
-- can_plan_hs_schedule() is the board (is_staff) or a coach; they read and
-- write everything here, except that only the board adds or deletes a whole
-- season (lib/hs-schedule/access.ts lets the same people in). Helper calls
-- are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0107. Idempotent.

begin;

-- ─── Who can plan ───────────────────────────────────────────────────────────

create or replace function public.is_coach()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.members m
      join public.olb_team_volunteers tv on tv.member_id = m.id
      join public.olb_volunteer_roles r on r.id = tv.role_id
     where m.user_id = auth.uid()
       and m.deleted_at is null
       and m.status = 'approved'
       and r.is_leadership
       and r.deleted_at is null
  )
$$;

revoke all on function public.is_coach() from public, anon;
grant execute on function public.is_coach() to authenticated;

create or replace function public.can_plan_hs_schedule()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_staff() or public.is_coach()
$$;

revoke all on function public.can_plan_hs_schedule() from public, anon;
grant execute on function public.can_plan_hs_schedule() to authenticated;

-- ─── Seasons ────────────────────────────────────────────────────────────────

create table if not exists public.hs_seasons (
  id             uuid primary key default gen_random_uuid(),
  season         int  not null unique check (season between 2000 and 2100),
  title          text not null default 'High School Schedule'
                 check (length(btrim(title)) between 1 and 120),
  notes          text,
  imported_from  text,
  imported_at    timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─── Our teams (the columns) ────────────────────────────────────────────────

create table if not exists public.hs_levels (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.hs_seasons(id) on delete cascade,
  label       text not null check (length(btrim(label)) between 1 and 12),
  name        text check (name is null or length(name) <= 60),
  team_id     uuid references public.olb_teams(id) on delete set null,
  hidden      boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists hs_levels_season_idx on public.hs_levels (season_id, sort_order);

-- ─── Weekends (the rows) ────────────────────────────────────────────────────

create table if not exists public.hs_weekends (
  id                   uuid primary key default gen_random_uuid(),
  season_id            uuid not null references public.hs_seasons(id) on delete cascade,
  starts_on            date not null,
  ends_on              date not null,
  event                text not null default '' check (length(event) <= 300),
  details              text,
  location             text,
  trip                 text,
  status               text not null default 'planned',
  notes                text,
  facility_contact_id  uuid references public.contacts(id) on delete set null,
  sort_order           int not null default 0,
  created_by           uuid references auth.users(id) on delete set null,
  updated_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint hs_weekends_dates_check check (ends_on >= starts_on and ends_on <= starts_on + 14),
  constraint hs_weekends_status_check check (status in (
    'planned', 'tentative', 'need_facility', 'in_process', 'secured', 'canceled', 'off'
  ))
);

create index if not exists hs_weekends_season_idx on public.hs_weekends (season_id, starts_on, sort_order);
create index if not exists hs_weekends_facility_idx on public.hs_weekends (facility_contact_id)
  where facility_contact_id is not null;

-- ─── Games per team per weekend (the cells) ─────────────────────────────────

create table if not exists public.hs_weekend_games (
  weekend_id  uuid not null references public.hs_weekends(id) on delete cascade,
  level_id    uuid not null references public.hs_levels(id) on delete cascade,
  games       smallint check (games is null or games between 0 and 30),
  unsure      boolean not null default false,
  note        text check (note is null or length(note) <= 120),
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (weekend_id, level_id)
);

create index if not exists hs_weekend_games_level_idx on public.hs_weekend_games (level_id);

-- ─── Opponents: the teams coming ────────────────────────────────────────────

create table if not exists public.hs_opponents (
  id           uuid primary key default gen_random_uuid(),
  weekend_id   uuid not null references public.hs_weekends(id) on delete cascade,
  level_id     uuid references public.hs_levels(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete set null,
  name         text not null check (length(btrim(name)) between 1 and 120),
  status       text not null default 'confirmed'
               check (status in ('confirmed', 'tentative', 'declined')),
  our_score    smallint check (our_score is null or our_score between 0 and 300),
  their_score  smallint check (their_score is null or their_score between 0 and 300),
  note         text check (note is null or length(note) <= 300),
  sort_order   int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint hs_opponents_score_pair check ((our_score is null) = (their_score is null))
);

create index if not exists hs_opponents_weekend_idx on public.hs_opponents (weekend_id, sort_order);
create index if not exists hs_opponents_contact_idx on public.hs_opponents (contact_id)
  where contact_id is not null;
create index if not exists hs_opponents_level_idx on public.hs_opponents (level_id)
  where level_id is not null;

-- ─── updated_at ─────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['hs_seasons', 'hs_levels', 'hs_weekends', 'hs_weekend_games', 'hs_opponents'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- ─── Row-level security ─────────────────────────────────────────────────────

alter table public.hs_seasons       enable row level security;
alter table public.hs_levels        enable row level security;
alter table public.hs_weekends      enable row level security;
alter table public.hs_weekend_games enable row level security;
alter table public.hs_opponents     enable row level security;

-- Seasons: planners read and edit them; the board adds and deletes them.
drop policy if exists "hs_seasons_select_planner" on public.hs_seasons;
create policy "hs_seasons_select_planner" on public.hs_seasons
  for select to authenticated
  using ((select public.can_plan_hs_schedule()));

drop policy if exists "hs_seasons_insert_staff" on public.hs_seasons;
create policy "hs_seasons_insert_staff" on public.hs_seasons
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists "hs_seasons_update_planner" on public.hs_seasons;
create policy "hs_seasons_update_planner" on public.hs_seasons
  for update to authenticated
  using ((select public.can_plan_hs_schedule()))
  with check ((select public.can_plan_hs_schedule()));

drop policy if exists "hs_seasons_delete_staff" on public.hs_seasons;
create policy "hs_seasons_delete_staff" on public.hs_seasons
  for delete to authenticated
  using ((select public.is_staff()));

-- Everything inside a season: planners read and write it all.
do $$
declare t text;
begin
  foreach t in array array['hs_levels', 'hs_weekends', 'hs_weekend_games', 'hs_opponents'] loop
    execute format('drop policy if exists %I on public.%I', t || '_planner_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.can_plan_hs_schedule()))
         with check ((select public.can_plan_hs_schedule()))',
      t || '_planner_all', t
    );
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
