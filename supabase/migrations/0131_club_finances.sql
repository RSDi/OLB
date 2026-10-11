-- 0131_club_finances.sql
--
-- Club finances: the rest of the Treasurer's spreadsheet on the site. What
-- the club budgets and spends, money that comes in from outside families
-- (donations, sponsors, the tournament we host), clinics and workouts with
-- their own sign-ups, fundraiser shifts (Nelson's Produce) credited to a
-- family or to the general program fund, the season's fee tiers, the coach's
-- kid comp, and a due date on each family's balance.
--
-- New tables only, plus one existing check widened: olb_charges gets the
-- categories 'program', 'team_cost', 'merch' (charges) and 'coach_comp',
-- 'fundraising' (credits). Nothing else existing changes. With no Fees
-- settings saved and the switch off, registration, Approve and Payments
-- work exactly as before.
--
--   olb_finance_settings     one row per season: the switch, fee tiers,
--                            coach's kid comp, fundraising rate, default due
--   olb_player_due           a due date for a player's balance (a family's
--                            date is set on each of its players)
--   olb_budget_groups        General, Practice gyms, Teams, Programs…
--   olb_hosted_events        a tournament we host (MRS): its own budget lines
--                            and income
--   olb_programs             clinics, workouts, camps: dates, prices by level,
--                            open for sign-up or not
--   olb_program_signups      who signed up. A player on the roster gets a
--                            'program' charge on the family's Payments
--                            account; anyone else is paid on the sign-up
--   olb_budget_lines         one budgeted cost: group, optional team /
--                            program / event, vendor, month, amount
--   olb_expense_payments     what was actually paid on a line, check number
--                            and all (a deposit, then the rest)
--   olb_budget_line_charges  a team cost split across that team's families:
--                            the 'team_cost' charges it made
--   olb_program_funds        where fundraiser money can go besides a family's
--                            fees (Buckets for Bucks)
--   olb_income               money in that isn't a family's payment
--   olb_fundraisers          where money is earned (Nelson's Produce)
--   olb_fundraiser_shifts    one person's shift: hours, amount, and where it
--                            goes (a player's account or a fund), as the
--                            worker chose
--
-- A new permission, "finances_view" (lib/auth/access.ts): see the club's
-- Snapshot (no family names or balances). The board has it already.
-- can_view_finances() = the board, finances_view, or Payments.
--
-- Access: Payments (can_manage_finances()) reads and writes everything. The
-- budget, income, events, programs and funds (no family details) are also
-- readable with can_view_finances(). Sign-ups and shifts name children and
-- parents, so only Payments reads them. Public program sign-ups are written
-- by the server (service role). Helper calls wrapped in (select …) per
-- AGENTS.md. Nothing is deleted: entries are voided, like 0101.
--
-- To remove: supabase/removal/0131_club_finances_down.sql.
--
-- Apply via the Supabase SQL editor, after 0130. Idempotent.

begin;

-- ─── Helper ─────────────────────────────────────────────────────────────────

create or replace function public.can_view_finances()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() or public.has_permission('finances_view') or public.has_permission('payments') $$;

revoke all on function public.can_view_finances() from public, anon;
grant execute on function public.can_view_finances() to authenticated, service_role;

-- ─── Family ledger: the new categories ──────────────────────────────────────

alter table public.olb_charges drop constraint if exists olb_charges_category_check;
alter table public.olb_charges add constraint olb_charges_category_check check (
  (kind = 'charge' and category in ('registration', 'uniform', 'tournament', 'refund', 'other', 'program', 'team_cost', 'merch'))
  or (kind = 'credit' and category in ('covered', 'scholarship', 'adjustment', 'coach_comp', 'fundraising'))
);

-- ─── Settings ───────────────────────────────────────────────────────────────

create table if not exists public.olb_finance_settings (
  board_id                uuid primary key references public.olb_boards(id) on delete cascade,
  -- Budget, Income, Programs, Fundraising and Snapshot show for everyone
  -- who should see them. Off: the preview accounts only.
  enabled                 boolean not null default false,
  -- [{ "label": "8u-12u", "max_age": 12, "cents": 37500 }, …]; the last
  -- tier's max_age is null (and up). Empty: the form's built-in tiers.
  fee_tiers               jsonb not null default '[]'::jsonb,
  comp_coach_kids         boolean not null default false,
  -- Null: the whole registration fee. Otherwise this much off.
  coach_comp_cents        int check (coach_comp_cents is null or coach_comp_cents > 0),
  fundraising_rate_cents  int not null default 1000 check (fundraising_rate_cents between 0 and 100000),
  default_due_on          date,
  updated_by              uuid references auth.users(id) on delete set null,
  updated_at              timestamptz not null default now()
);

create table if not exists public.olb_player_due (
  player_id   uuid primary key references public.olb_players(id) on delete cascade,
  board_id    uuid not null references public.olb_boards(id) on delete cascade,
  due_on      date not null,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ─── Budget ─────────────────────────────────────────────────────────────────

create table if not exists public.olb_budget_groups (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.olb_boards(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (board_id, name)
);

create table if not exists public.olb_hosted_events (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.olb_boards(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  starts_on   date,
  ends_on     date,
  note        text check (note is null or length(note) <= 500),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.olb_programs (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.olb_boards(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 80),
  kind         text not null default 'clinic' check (kind in ('clinic', 'workout', 'camp', 'other')),
  starts_on    date,
  ends_on      date,
  schedule     text check (schedule is null or length(schedule) <= 300),
  location     text check (location is null or length(location) <= 200),
  description  text check (description is null or length(description) <= 2000),
  -- [{ "label": "High school", "cents": 10000 }, …]; one level for a
  -- single price.
  levels       jsonb not null default '[]'::jsonb,
  open         boolean not null default false,
  capacity     int check (capacity is null or capacity > 0),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create table if not exists public.olb_budget_lines (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.olb_boards(id) on delete cascade,
  group_id      uuid not null references public.olb_budget_groups(id),
  team_id       uuid references public.olb_teams(id) on delete set null,
  program_id    uuid references public.olb_programs(id) on delete set null,
  event_id      uuid references public.olb_hosted_events(id) on delete set null,
  vendor        text check (vendor is null or length(vendor) <= 80),
  description   text not null check (length(btrim(description)) between 1 and 120),
  -- The first of the month it's for (gym rent by month), or null.
  month         date,
  budget_cents  int not null default 0 check (budget_cents >= 0),
  note          text check (note is null or length(note) <= 500),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references auth.users(id) on delete set null
);

create index if not exists olb_budget_lines_board_idx on public.olb_budget_lines (board_id, group_id);

create table if not exists public.olb_expense_payments (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.olb_boards(id) on delete cascade,
  line_id       uuid not null references public.olb_budget_lines(id) on delete cascade,
  amount_cents  int not null check (amount_cents > 0),
  paid_on       date not null default current_date,
  method        text not null check (method in ('check', 'card', 'venmo', 'cash', 'transfer', 'other')),
  reference     text check (reference is null or length(reference) <= 80),
  note          text check (note is null or length(note) <= 500),
  recorded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references auth.users(id) on delete set null
);

create index if not exists olb_expense_payments_line_idx on public.olb_expense_payments (line_id);

create table if not exists public.olb_budget_line_charges (
  line_id    uuid not null references public.olb_budget_lines(id) on delete cascade,
  charge_id  uuid not null references public.olb_charges(id) on delete cascade,
  primary key (line_id, charge_id)
);

-- ─── Programs: sign-ups ─────────────────────────────────────────────────────

create table if not exists public.olb_program_signups (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.olb_boards(id) on delete cascade,
  program_id    uuid not null references public.olb_programs(id) on delete cascade,
  -- On this season's roster: the fee is a charge on the family's account.
  player_id     uuid references public.olb_players(id) on delete set null,
  child_first   text not null check (length(btrim(child_first)) between 1 and 60),
  child_last    text not null check (length(btrim(child_last)) between 1 and 60),
  child_dob     date,
  level         text check (level is null or length(level) <= 60),
  price_cents   int not null default 0 check (price_cents >= 0),
  parent_name   text check (parent_name is null or length(parent_name) <= 120),
  parent_email  text check (parent_email is null or length(parent_email) <= 200),
  parent_phone  text check (parent_phone is null or length(parent_phone) <= 40),
  note          text check (note is null or length(note) <= 500),
  charge_id     uuid references public.olb_charges(id) on delete set null,
  -- Not on the roster: paid here.
  paid_cents    int not null default 0 check (paid_cents >= 0),
  paid_on       date,
  paid_method   text check (paid_method is null or paid_method in ('venmo', 'check', 'cash', 'card', 'other', 'waived')),
  paid_ref      text check (paid_ref is null or length(paid_ref) <= 80),
  submission_key text unique check (submission_key is null or length(submission_key) between 8 and 80),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);

create index if not exists olb_program_signups_program_idx on public.olb_program_signups (program_id);

-- ─── Fundraising ────────────────────────────────────────────────────────────

create table if not exists public.olb_program_funds (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.olb_boards(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  description  text check (description is null or length(description) <= 300),
  sort_order   int not null default 0,
  archived_at  timestamptz,
  unique (board_id, name)
);

create table if not exists public.olb_fundraisers (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.olb_boards(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  rate_cents   int not null default 1000 check (rate_cents between 0 and 100000),
  archived_at  timestamptz,
  unique (board_id, name)
);

create table if not exists public.olb_income (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.olb_boards(id) on delete cascade,
  category      text not null check (category in ('donation', 'sponsor', 'event', 'program', 'vendor_credit', 'merch', 'fundraiser', 'other')),
  program_id    uuid references public.olb_programs(id) on delete set null,
  event_id      uuid references public.olb_hosted_events(id) on delete set null,
  fund_id       uuid references public.olb_program_funds(id) on delete set null,
  from_name     text check (from_name is null or length(from_name) <= 120),
  description   text not null check (length(btrim(description)) between 1 and 120),
  -- What came in, and when. 0 and no date: expected, not in yet (MRS
  -- registration budgeted at $4,000).
  amount_cents  int not null default 0 check (amount_cents >= 0),
  received_on   date,
  budget_cents  int check (budget_cents is null or budget_cents >= 0),
  method        text check (method is null or method in ('check', 'card', 'venmo', 'cash', 'transfer', 'other')),
  reference     text check (reference is null or length(reference) <= 80),
  note          text check (note is null or length(note) <= 500),
  recorded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references auth.users(id) on delete set null,
  constraint olb_income_some_amount check (amount_cents > 0 or coalesce(budget_cents, 0) > 0)
);

create index if not exists olb_income_board_idx on public.olb_income (board_id);

create table if not exists public.olb_fundraiser_shifts (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.olb_boards(id) on delete cascade,
  fundraiser_id  uuid not null references public.olb_fundraisers(id),
  event_label    text check (event_label is null or length(event_label) <= 80),
  worked_on      date,
  worker_name    text not null check (length(btrim(worker_name)) between 1 and 120),
  hours          numeric(6, 2) not null check (hours > 0 and hours <= 200),
  amount_cents   int not null check (amount_cents > 0),
  destination    text not null check (destination in ('family', 'fund')),
  player_id      uuid references public.olb_players(id),
  fund_id        uuid references public.olb_program_funds(id),
  charge_id      uuid references public.olb_charges(id) on delete set null,
  note           text check (note is null or length(note) <= 500),
  recorded_by    uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  voided_at      timestamptz,
  voided_by      uuid references auth.users(id) on delete set null,
  constraint olb_fundraiser_shifts_where check (
    (destination = 'family' and player_id is not null)
    or (destination = 'fund' and fund_id is not null)
  )
);

create index if not exists olb_fundraiser_shifts_board_idx on public.olb_fundraiser_shifts (board_id, fundraiser_id);

-- ─── Access ─────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  -- Payments reads and writes all of it (writes go through the server too).
  foreach t in array array[
    'olb_finance_settings', 'olb_player_due', 'olb_budget_groups', 'olb_hosted_events', 'olb_programs',
    'olb_budget_lines', 'olb_expense_payments', 'olb_budget_line_charges', 'olb_program_signups',
    'olb_program_funds', 'olb_fundraisers', 'olb_income', 'olb_fundraiser_shifts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_finance_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.can_manage_finances())) with check ((select public.can_manage_finances()))',
      t || '_finance_all', t
    );
  end loop;
  -- No family details here: the board and finances_view read them too.
  foreach t in array array[
    'olb_finance_settings', 'olb_budget_groups', 'olb_hosted_events', 'olb_programs',
    'olb_budget_lines', 'olb_expense_payments', 'olb_program_funds', 'olb_fundraisers', 'olb_income'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_view_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.can_view_finances()))',
      t || '_view_select', t
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';

commit;
