-- 0089_olb_teams.sql
--
-- Team manager + public player registration, ported from the operations
-- app's standalone /olb module (its 20260601120000_olb_tables.sql). Same
-- tables and columns, minus that module's own login:
--   - no olb_users table: managers are portal super-admins;
--   - olb_registrations.reviewed_by references auth.users (the reviewer's
--     sign-in, as maintenance_requests.reviewed_by does), not olb_users.
--
-- RLS: super-admins can read and write every olb_ table; nobody else has a
-- policy. The public registration form inserts through a server action with
-- the service role (lib/teams/registration-actions.ts), which bypasses RLS,
-- so anonymous visitors never touch these tables directly.
--
-- This is a fresh schema — no data is copied from the operations database.
-- Additive only. Apply via the Supabase SQL editor. Idempotent.

begin;

-- Season container. One row per season; everything else hangs off it.
create table if not exists public.olb_boards (
  id          uuid primary key default gen_random_uuid(),
  season      text not null,
  name        text not null default 'Omaha Lightning Basketball',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (season)
);

create table if not exists public.olb_teams (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.olb_boards(id) on delete cascade,
  name           text not null,
  age_group      text,                              -- '10U','12U','14U','17U'
  color          text,                              -- GREY/BLACK/RED/BLUE/WHITE/GOLD — column tint
  grade_label    text,                              -- '4th','5th','7th','8th','HS'
  division       text,                              -- 'Mid Bronze','Lower Silver', …
  practice_times text[] not null default '{}',
  target_size    int,
  min_size       int,
  max_size       int,
  sort_order     int  not null default 0,
  raw_header     text,                              -- original sheet header (audit)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists olb_teams_board_idx on public.olb_teams (board_id);

create table if not exists public.olb_players (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.olb_boards(id) on delete cascade,
  team_id     uuid references public.olb_teams(id) on delete set null,   -- null = Unassigned pool
  full_name   text not null,
  dob         date,
  grade       text,
  sort_order  int  not null default 0,
  import_flag text,                                 -- e.g. 'dob_check'; null = clean
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists olb_players_board_idx on public.olb_players (board_id);
create index if not exists olb_players_team_idx  on public.olb_players (team_id);

create table if not exists public.olb_coaches (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.olb_boards(id) on delete cascade,
  team_id     uuid references public.olb_teams(id) on delete set null,
  name        text not null,
  role        text,                                 -- 'head'/'assistant' or null
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists olb_coaches_board_idx on public.olb_coaches (board_id);
create index if not exists olb_coaches_team_idx  on public.olb_coaches (team_id);

-- Public registration intake. Signups land here as 'pending' and a
-- super-admin approves them into olb_players (linked via player_id).
create table if not exists public.olb_registrations (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.olb_boards(id) on delete cascade,
  first_name   text not null,
  last_name    text not null,
  dob          date,
  gender       text,
  grade        text,
  school       text,
  parent_name  text,
  parent_email text,
  parent_phone text,
  notes        text,
  extra        jsonb not null default '{}',         -- catch-all for extra form fields
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  player_id    uuid references public.olb_players(id) on delete set null,
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists olb_registrations_board_idx  on public.olb_registrations (board_id);
create index if not exists olb_registrations_status_idx on public.olb_registrations (status);

-- Import audit — a snapshot of each spreadsheet import.
create table if not exists public.olb_import_batches (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid references public.olb_boards(id) on delete cascade,
  filename   text,
  summary    jsonb not null default '{}',
  raw        jsonb,
  created_at timestamptz not null default now()
);
create index if not exists olb_import_batches_board_idx on public.olb_import_batches (board_id);

-- Super-admin read/write on every olb_ table. is_super_admin() is wrapped in a
-- subquery so it runs once per statement (see AGENTS.md).
do $$
declare t text;
begin
  foreach t in array array[
    'olb_boards', 'olb_teams', 'olb_players', 'olb_coaches',
    'olb_registrations', 'olb_import_batches'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_super_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.is_super_admin()))
         with check ((select public.is_super_admin()))',
      t || '_super_all', t
    );
  end loop;
end $$;

-- Seed the season container.
insert into public.olb_boards (season, name)
values ('2026-2027', 'Omaha Lightning Basketball')
on conflict (season) do nothing;

commit;
