-- 0134_hosted_tournaments.sql
--
-- Tournaments we host (the Missouri River Shootout): a weekend on the HS
-- Schedule ticked "We host this tournament" gets a planning page of its own
-- (/portal/schedule/hosted/<weekend>), in place of the tournament director's
-- spreadsheet ("Missouri River Shootout Nov 2026": the master schedule, the
-- program communication, the JV bracket and the money).
--
--   hs_hosted            one per weekend we host. hosted: unticking keeps the
--                        plan but takes the page off the schedule.
--                        finance_event_id: the tournament in Finances
--                        (olb_hosted_events, 0131) whose budget it fills.
--                        game_minutes / courts / days: what the scheduler
--                        fills ([{ "date": "2026-11-13", "start": "14:00",
--                        "end": "21:30" }, …]). team_fee_cents: what a team
--                        pays to come, unless it says otherwise. facility,
--                        concessions, rules, admission: what the program
--                        communication tells the programs coming.
--   hs_hosted_steps      the checklist: secure the facility (walk-through,
--                        point of contact, certificate of insurance, pricing,
--                        contract), teams, officials, communication, game
--                        day. A new plan starts with the usual steps.
--   hs_hosted_divisions  HS Boys A, HS Boys B, HS Girls, JH Boys…: code is the
--                        short form the schedule shows (HSA). format: pool
--                        (round robin) or bracket.
--   hs_hosted_teams      the teams entered, each in a division: a program
--                        coming (opponent_id, from the HS Schedule) or just a
--                        name, a short code ("OL 1"), its seed, and its fee
--                        (null: the tournament's team fee; 0: no fee, like
--                        our own teams).
--   hs_hosted_games      a game: its division, number and round, the two
--                        teams (or, in a bracket, "Winner Game 1" and "Loser
--                        Game 2": home_from / away_from name the game they
--                        come from, as 'W:<game id>' or 'L:<game id>'), when
--                        and on which court, and the score.
--   hs_hosted_money      the tournament's budget, like the spreadsheet's
--                        bottom half: revenue (sponsors, admissions, other)
--                        and expenses (court fees, referees, other) as a
--                        count times an amount. A referee line can follow a
--                        division's games on the schedule (division_id with
--                        no count). Team fees come from the teams entered.
--   hs_hosted_finance    which Finances budget line or income row each
--                        estimate went to (Update the budget), so sending it
--                        again updates them instead of adding more. Only the
--                        server (service role) writes it.
--   hs_hosted_messages   a copy of each email sent to the programs coming.
--
-- Who. The people who plan the HS Schedule (can_plan_hs_schedule(), 0108:
-- the board and the coaches) plan a tournament too. The money in Finances
-- stays the Treasurer's: only the Payments permission sends the estimates to
-- the budget (lib/hosted/finance-actions.ts, service role after the check),
-- and only can_view_finances() sees what's been paid and received. Helper
-- calls are wrapped in (select …) per AGENTS.md.
--
-- To remove: supabase/removal/0134_hosted_tournaments_down.sql.
--
-- Apply via the Supabase SQL editor, after 0133. Idempotent.

begin;

create table if not exists public.hs_hosted (
  weekend_id        uuid primary key references public.hs_weekends(id) on delete cascade,
  hosted            boolean not null default true,
  short_name        text check (short_name is null or length(short_name) <= 20),
  finance_event_id  uuid references public.olb_hosted_events(id) on delete set null,
  game_minutes      int not null default 75 check (game_minutes between 20 and 180),
  courts            int not null default 4 check (courts between 1 and 20),
  days              jsonb not null default '[]'::jsonb,
  team_fee_cents    int check (team_fee_cents is null or team_fee_cents between 0 and 10000000),
  facility          text check (facility is null or length(facility) <= 1000),
  concessions       text check (concessions is null or length(concessions) <= 2000),
  rules             text check (rules is null or length(rules) <= 4000),
  admission         text check (admission is null or length(admission) <= 2000),
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists hs_hosted_finance_idx on public.hs_hosted (finance_event_id)
  where finance_event_id is not null;

create table if not exists public.hs_hosted_steps (
  id          uuid primary key default gen_random_uuid(),
  weekend_id  uuid not null references public.hs_hosted(weekend_id) on delete cascade,
  section     text not null default 'other'
              check (section in ('facility', 'teams', 'officials', 'communication', 'game_day', 'other')),
  label       text not null check (length(btrim(label)) between 1 and 200),
  due_on      date,
  done_on     date,
  done_by     uuid references auth.users(id) on delete set null,
  note        text check (note is null or length(note) <= 1000),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists hs_hosted_steps_weekend_idx on public.hs_hosted_steps (weekend_id, section, sort_order);

create table if not exists public.hs_hosted_divisions (
  id          uuid primary key default gen_random_uuid(),
  weekend_id  uuid not null references public.hs_hosted(weekend_id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  code        text check (code is null or length(code) <= 12),
  format      text not null default 'pool' check (format in ('pool', 'bracket')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists hs_hosted_divisions_weekend_idx on public.hs_hosted_divisions (weekend_id, sort_order);

create table if not exists public.hs_hosted_teams (
  id           uuid primary key default gen_random_uuid(),
  weekend_id   uuid not null references public.hs_hosted(weekend_id) on delete cascade,
  division_id  uuid references public.hs_hosted_divisions(id) on delete set null,
  opponent_id  uuid references public.hs_opponents(id) on delete set null,
  ours         boolean not null default false,
  name         text not null check (length(btrim(name)) between 1 and 120),
  code         text check (code is null or length(code) <= 12),
  seed         int check (seed is null or seed between 1 and 64),
  fee_cents    int check (fee_cents is null or fee_cents between 0 and 10000000),
  note         text check (note is null or length(note) <= 300),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists hs_hosted_teams_weekend_idx on public.hs_hosted_teams (weekend_id, division_id, sort_order);

create table if not exists public.hs_hosted_games (
  id            uuid primary key default gen_random_uuid(),
  weekend_id    uuid not null references public.hs_hosted(weekend_id) on delete cascade,
  division_id   uuid references public.hs_hosted_divisions(id) on delete cascade,
  game_no       int not null default 0,
  round         int not null default 1 check (round between 1 and 20),
  label         text check (label is null or length(label) <= 80),
  home_team_id  uuid references public.hs_hosted_teams(id) on delete set null,
  away_team_id  uuid references public.hs_hosted_teams(id) on delete set null,
  home_from     text check (home_from is null or home_from ~ '^[WL]:[0-9a-f-]{36}$'),
  away_from     text check (away_from is null or away_from ~ '^[WL]:[0-9a-f-]{36}$'),
  plays_on      date,
  starts_at     time,
  court         int check (court is null or court between 1 and 20),
  home_score    smallint check (home_score is null or home_score between 0 and 300),
  away_score    smallint check (away_score is null or away_score between 0 and 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint hs_hosted_games_score_pair check ((home_score is null) = (away_score is null))
);

create index if not exists hs_hosted_games_weekend_idx on public.hs_hosted_games (weekend_id, plays_on, starts_at, court);

create table if not exists public.hs_hosted_money (
  id           uuid primary key default gen_random_uuid(),
  weekend_id   uuid not null references public.hs_hosted(weekend_id) on delete cascade,
  kind         text not null check (kind in ('revenue', 'expense')),
  category     text not null default 'other'
               check (category in ('sponsor', 'admission', 'court', 'referee', 'other')),
  label        text not null check (length(btrim(label)) between 1 and 120),
  qty          numeric(10, 2) check (qty is null or qty between 0 and 100000),
  unit_cents   int not null default 0 check (unit_cents between 0 and 100000000),
  division_id  uuid references public.hs_hosted_divisions(id) on delete set null,
  note         text check (note is null or length(note) <= 300),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists hs_hosted_money_weekend_idx on public.hs_hosted_money (weekend_id, kind, sort_order);

create table if not exists public.hs_hosted_finance (
  weekend_id      uuid not null references public.hs_hosted(weekend_id) on delete cascade,
  -- An hs_hosted_money id, or 'teams' for the team fees.
  money_key       text not null check (length(money_key) between 1 and 40),
  budget_line_id  uuid references public.olb_budget_lines(id) on delete set null,
  income_id       uuid references public.olb_income(id) on delete set null,
  synced_at       timestamptz not null default now(),
  primary key (weekend_id, money_key)
);

create table if not exists public.hs_hosted_messages (
  id          uuid primary key default gen_random_uuid(),
  weekend_id  uuid not null references public.hs_hosted(weekend_id) on delete cascade,
  subject     text not null check (length(subject) between 1 and 200),
  body        text not null check (length(body) between 1 and 20000),
  sent_to     jsonb not null default '[]'::jsonb,
  sent_count  int not null default 0,
  sent_by     uuid references auth.users(id) on delete set null,
  sent_at     timestamptz not null default now()
);

create index if not exists hs_hosted_messages_weekend_idx on public.hs_hosted_messages (weekend_id, sent_at desc);

-- ─── updated_at ─────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['hs_hosted', 'hs_hosted_steps', 'hs_hosted_divisions', 'hs_hosted_teams', 'hs_hosted_games', 'hs_hosted_money'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- ─── Row-level security ─────────────────────────────────────────────────────

do $$
declare t text;
begin
  -- The planners read and write the plan.
  foreach t in array array[
    'hs_hosted', 'hs_hosted_steps', 'hs_hosted_divisions', 'hs_hosted_teams',
    'hs_hosted_games', 'hs_hosted_money', 'hs_hosted_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_planner_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.can_plan_hs_schedule()))
         with check ((select public.can_plan_hs_schedule()))',
      t || '_planner_all', t
    );
  end loop;
end $$;

-- The links to Finances: read with Finances, written by the server only.
alter table public.hs_hosted_finance enable row level security;
drop policy if exists "hs_hosted_finance_view_select" on public.hs_hosted_finance;
create policy "hs_hosted_finance_view_select" on public.hs_hosted_finance
  for select to authenticated
  using ((select public.can_view_finances()));

commit;

notify pgrst, 'reload schema';
