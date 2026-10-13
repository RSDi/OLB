-- 0133: messaging families from Finances, and a weekly balance reminder.
--
--   olb_finance_settings   + the weekly reminder: on or off, the weekday it
--                          goes, when it starts (as soon as a family owes, or
--                          some days from their due date), who gets it, and
--                          its subject and message ({balance}, {due_date},
--                          {player}, {family} are filled in for each family)
--   olb_balance_reminders  one row per family per week the reminder went
--                          (or failed): the unique key stops a second send
--                          the same week
--   olb_reminder_pauses    players whose family the Treasurer has taken off
--                          the reminder (a payment plan, say)
--
-- Payments (can_manage_finances()) can also read the email templates (0117)
-- to start a message from one, and see the copies of messages they send on
-- players' pages (olb_player_messages, 0116/0118). Sending is server-side.

alter table public.olb_finance_settings
  add column if not exists reminder_enabled boolean not null default false,
  -- 1 = Monday … 7 = Sunday.
  add column if not exists reminder_weekday int not null default 1 check (reminder_weekday between 1 and 7),
  -- 'owing': every week a family owes. 'due': from their due date, moved by
  -- reminder_offset_days (-7 a week before, 7 a week after).
  add column if not exists reminder_start text not null default 'due' check (reminder_start in ('owing', 'due')),
  add column if not exists reminder_offset_days int not null default 0 check (reminder_offset_days between -60 and 120),
  add column if not exists reminder_roles text[] not null default array['father', 'mother', 'guardian']::text[],
  add column if not exists reminder_subject text check (reminder_subject is null or length(reminder_subject) <= 200),
  add column if not exists reminder_body text check (reminder_body is null or length(reminder_body) <= 4000);

create table if not exists public.olb_balance_reminders (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.olb_boards(id) on delete cascade,
  -- The family: its players' ids, sorted and joined.
  family_key     text not null check (length(family_key) between 1 and 2000),
  -- The Monday of the week it went.
  week           date not null,
  player_ids     uuid[] not null default '{}',
  to_emails      text[] not null default '{}',
  balance_cents  int not null,
  status         text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  error          text check (error is null or length(error) <= 500),
  created_at     timestamptz not null default now(),
  unique (board_id, family_key, week)
);

create index if not exists olb_balance_reminders_board_idx on public.olb_balance_reminders (board_id, created_at desc);

create table if not exists public.olb_reminder_pauses (
  player_id  uuid primary key references public.olb_players(id) on delete cascade,
  board_id   uuid not null references public.olb_boards(id) on delete cascade,
  paused_by  uuid references auth.users(id) on delete set null,
  paused_at  timestamptz not null default now()
);

alter table public.olb_balance_reminders enable row level security;
alter table public.olb_reminder_pauses enable row level security;

-- The reminder log is written by the daily job (service role); Payments reads it.
drop policy if exists "olb_balance_reminders_select" on public.olb_balance_reminders;
create policy "olb_balance_reminders_select" on public.olb_balance_reminders
  for select to authenticated
  using ((select public.can_manage_finances()));

drop policy if exists "olb_reminder_pauses_all" on public.olb_reminder_pauses;
create policy "olb_reminder_pauses_all" on public.olb_reminder_pauses
  for all to authenticated
  using ((select public.can_manage_finances()))
  with check ((select public.can_manage_finances()));

-- Templates: Payments can start a message from one.
drop policy if exists "olb_email_templates_select" on public.olb_email_templates;
create policy "olb_email_templates_select" on public.olb_email_templates
  for select to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_registrations())
    or (select public.can_slack_dm())
    or (select public.can_manage_finances())
  );

-- Copies of what was sent, on players' pages.
drop policy if exists "olb_player_messages_select" on public.olb_player_messages;
create policy "olb_player_messages_select" on public.olb_player_messages
  for select to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_registrations())
    or (select public.can_slack_dm())
    or (select public.can_manage_finances())
  );

notify pgrst, 'reload schema';
