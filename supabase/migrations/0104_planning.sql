-- 0104_planning.sql
--
-- Planning: the board's year as a calendar of tasks it builds on every season.
-- The Events page becomes Planning (/portal/events).
--
--   planning_roles           who does the work: President, Athletic Director,
--                            Treasurer, Communications, Coaches… managed in
--                            Settings → Planning Roles. member_id is who holds
--                            the role now; a season sent to Review assigns
--                            each role's tasks to them.
--   planning_templates       the yearly template: what the President, the AD
--                            (and the board) do each month, plus the topics
--                            for each month's board meeting. Seeded below
--                            from "Timeline of Responsibilities for President
--                            and Athletic Director Positions" (4-17-2023).
--                            kind 'task'   → becomes an opportunity each season
--                                            (month null = year-round duty,
--                                            listed for reference only).
--                            kind 'agenda' → a topic on that month's board
--                                            meeting agenda.
--                            role_id is whose job it is (agenda topics
--                            belong to the whole board: no role).
--                            playbook_id links the playbook that explains how.
--   maintenance_requests     each season's copy of a template task is an
--   .planning_template_id    ordinary task (Opportunities), created as
--   .planning_season         pending_review. The board keeps (approved) or
--                            tosses (declined) it; kept ones show on the
--                            Planning calendar in their month. planning_season
--                            is the year the season starts (2026 = 2026–27,
--                            August through July). One copy per template per
--                            season, so sending a season to Review twice
--                            never duplicates, and a tossed item stays tossed.
--   planning_meetings        one board meeting per month: date, whether it
--                            happened, agenda and minutes. month is the first
--                            day of the month.
--   planning_meeting_notes   what the meeting said about each task, so the
--                            minutes travel with the task.
--
-- Board only (staff) throughout. For now only the staged-rollout accounts
-- (lib/auth/feature-preview.ts) see Planning in the app; lib/planning/access.ts
-- is the one place to open it up.
--
-- Apply via the Supabase SQL editor, after 0103. Idempotent.

begin;

-- ─── Roles ──────────────────────────────────────────────────────────────────

create table if not exists public.planning_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 60),
  chip_class  text not null default 'rsd-chip-mute',
  member_id   uuid references public.members(id) on delete set null,
  sort_order  int not null default 100,
  seed_key    text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

drop trigger if exists planning_roles_set_updated_at on public.planning_roles;
create trigger planning_roles_set_updated_at
  before update on public.planning_roles
  for each row execute function public.set_updated_at();

alter table public.planning_roles enable row level security;

drop policy if exists "planning_roles_select_staff" on public.planning_roles;
create policy "planning_roles_select_staff" on public.planning_roles
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "planning_roles_insert_staff" on public.planning_roles;
create policy "planning_roles_insert_staff" on public.planning_roles
  for insert to authenticated
  with check ((select public.is_staff()));

-- Removing a role is a soft delete (deleted_at), so it's an update.
drop policy if exists "planning_roles_update_staff" on public.planning_roles;
create policy "planning_roles_update_staff" on public.planning_roles
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "planning_roles_delete_super" on public.planning_roles;
create policy "planning_roles_delete_super" on public.planning_roles
  for delete to authenticated
  using ((select public.is_super_admin()));

insert into public.planning_roles (seed_key, name, chip_class, sort_order)
values
  ('role:president', 'President', 'rsd-chip-accent', 10),
  ('role:athletic_director', 'Athletic Director', 'rsd-chip-success', 20),
  ('role:treasurer', 'Treasurer', 'rsd-chip-warn', 30),
  ('role:communications', 'Communications', 'rsd-chip-mute', 40),
  ('role:coaches', 'Coaches', 'rsd-chip-mute', 50)
on conflict (seed_key) do nothing;

-- ─── The yearly template ────────────────────────────────────────────────────

create table if not exists public.planning_templates (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'task' check (kind in ('task', 'agenda')),
  title        text not null check (length(btrim(title)) between 1 and 300),
  notes        text,
  month        smallint check (month between 1 and 12),
  role_id      uuid references public.planning_roles(id) on delete set null,
  playbook_id  uuid references public.playbooks(id) on delete set null,
  sort_order   int not null default 0,
  -- Rows seeded by a migration carry a key so re-running it never duplicates.
  seed_key     text unique,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint planning_templates_agenda_has_month check (kind = 'task' or month is not null)
);

create index if not exists planning_templates_month_idx
  on public.planning_templates (month, sort_order)
  where deleted_at is null;

drop trigger if exists planning_templates_set_updated_at on public.planning_templates;
create trigger planning_templates_set_updated_at
  before update on public.planning_templates
  for each row execute function public.set_updated_at();

alter table public.planning_templates enable row level security;

drop policy if exists "planning_templates_select_staff" on public.planning_templates;
create policy "planning_templates_select_staff" on public.planning_templates
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "planning_templates_insert_staff" on public.planning_templates;
create policy "planning_templates_insert_staff" on public.planning_templates
  for insert to authenticated
  with check ((select public.is_staff()));

-- Removing an item is a soft delete (deleted_at), so it's an update.
drop policy if exists "planning_templates_update_staff" on public.planning_templates;
create policy "planning_templates_update_staff" on public.planning_templates
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "planning_templates_delete_super" on public.planning_templates;
create policy "planning_templates_delete_super" on public.planning_templates
  for delete to authenticated
  using ((select public.is_super_admin()));

-- ─── Each season's copy is a task ───────────────────────────────────────────

alter table public.maintenance_requests
  add column if not exists planning_template_id uuid
    references public.planning_templates(id) on delete set null,
  add column if not exists planning_season int
    check (planning_season is null or planning_season between 2000 and 2100);

create unique index if not exists maintenance_requests_planning_uniq
  on public.maintenance_requests (planning_template_id, planning_season)
  where planning_template_id is not null
    and planning_season is not null
    and deleted_at is null;

create index if not exists maintenance_requests_planning_season_idx
  on public.maintenance_requests (planning_season)
  where planning_season is not null and deleted_at is null;

-- ─── Monthly board meetings ─────────────────────────────────────────────────

create table if not exists public.planning_meetings (
  id          uuid primary key default gen_random_uuid(),
  month       date not null unique check (extract(day from month) = 1),
  meets_on    date,
  status      text not null default 'planned' check (status in ('planned', 'held', 'skipped')),
  agenda_md   text not null default '',
  minutes_md  text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists planning_meetings_set_updated_at on public.planning_meetings;
create trigger planning_meetings_set_updated_at
  before update on public.planning_meetings
  for each row execute function public.set_updated_at();

alter table public.planning_meetings enable row level security;

drop policy if exists "planning_meetings_select_staff" on public.planning_meetings;
create policy "planning_meetings_select_staff" on public.planning_meetings
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "planning_meetings_insert_staff" on public.planning_meetings;
create policy "planning_meetings_insert_staff" on public.planning_meetings
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists "planning_meetings_update_staff" on public.planning_meetings;
create policy "planning_meetings_update_staff" on public.planning_meetings
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "planning_meetings_delete_super" on public.planning_meetings;
create policy "planning_meetings_delete_super" on public.planning_meetings
  for delete to authenticated
  using ((select public.is_super_admin()));

create table if not exists public.planning_meeting_notes (
  meeting_id  uuid not null references public.planning_meetings(id) on delete cascade,
  task_id     uuid not null references public.maintenance_requests(id) on delete cascade,
  note_md     text not null check (length(btrim(note_md)) > 0),
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (meeting_id, task_id)
);

create index if not exists planning_meeting_notes_task_idx
  on public.planning_meeting_notes (task_id);

drop trigger if exists planning_meeting_notes_set_updated_at on public.planning_meeting_notes;
create trigger planning_meeting_notes_set_updated_at
  before update on public.planning_meeting_notes
  for each row execute function public.set_updated_at();

alter table public.planning_meeting_notes enable row level security;

-- Clearing a task's note deletes its row, so the board needs all four.
drop policy if exists "planning_meeting_notes_staff_all" on public.planning_meeting_notes;
create policy "planning_meeting_notes_staff_all" on public.planning_meeting_notes
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- ─── Seed: the 2023 Timeline of Responsibilities ────────────────────────────
-- Months as the club runs them, August through July. Month null = the
-- "Constant" duties at the top of each role's list. The "Monthly Board
-- Meeting — create agenda" sub-points became each month's agenda topics.

insert into public.planning_templates (seed_key, kind, role_id, month, sort_order, title, notes)
select v.seed_key, v.kind, r.id, v.month, v.sort_order, v.title, v.notes
from (values
  -- President · year-round
  ('rtg2023:p:00:01', 'task', 'president', null::int, 10, 'Check the Lightning Gmail account and answer questions', null::text),
  ('rtg2023:p:00:02', 'task', 'president', null, 20, 'Check the website contact page and answer questions', null),
  ('rtg2023:p:00:03', 'task', 'president', null, 30, 'Touch base with the AD on any concerns', 'Parent/family concerns, coach concerns and so on. Contact the people involved as needed and bring it to the board as needed.'),
  ('rtg2023:p:00:04', 'task', 'president', null, 40, 'Add important, timely items to the Lightning Bolt each Sunday', 'The Bolt goes out on Mondays.'),
  ('rtg2023:p:00:05', 'task', 'president', null, 50, 'Bring eligibility questions to the board', 'Research them against the rules NCHC sets.'),

  -- Athletic Director · year-round
  ('rtg2023:ad:00:01', 'task', 'athletic_director', null, 10, 'Attend practices — GS, JH, HS', null),
  ('rtg2023:ad:00:02', 'task', 'athletic_director', null, 20, 'Attend games and tournaments — GS, JH, HS', null),
  ('rtg2023:ad:00:03', 'task', 'athletic_director', null, 30, 'Cover door duty at St. Marks when no one else signs up', null),
  ('rtg2023:ad:00:04', 'task', 'athletic_director', null, 40, 'Communicate weather cancellations to practices and games', 'November – February. Tell the treasurer too, so facility billing is right.'),
  ('rtg2023:ad:00:05', 'task', 'athletic_director', null, 50, 'Coordinate travel for JH/HS teams as needed', 'Hotels, departure and arrival times, the schedule for away games and tournaments, paying for them, and rooming lists (chaperones, players who need rides or travel without family).'),
  ('rtg2023:ad:00:06', 'task', 'athletic_director', null, 60, 'Update TeamSnap as schedule details change', null),
  ('rtg2023:ad:00:07', 'task', 'athletic_director', null, 70, 'Send information for the weekly Lightning Bolt as needed', null),
  ('rtg2023:ad:00:08', 'task', 'athletic_director', null, 80, 'Coordinate referees for home games and tournaments', null),
  ('rtg2023:ad:00:09', 'task', 'athletic_director', null, 90, 'Coordinate facilities for home games and tournaments', 'Including parent volunteers to run the scoreboard and clock, sweep the floor, keep the book and film games.'),
  ('rtg2023:ad:00:10', 'task', 'athletic_director', null, 100, 'Handle eligibility questions and concerns', 'Take anything questionable to the President for board approval. Help research the rules through NCHC.'),

  -- August
  ('rtg2023:p:08:01', 'task', 'president', 8, 10, 'Organize a meal or snacks after the last GS Summer Clinic Saturday session', null),
  ('rtg2023:p:08:02', 'task', 'president', 8, 20, 'Design and oversee the presentation for the Parent/Family Meeting', null),
  ('rtg2023:p:08:03', 'task', 'president', 8, 30, 'Confirm any by-law changes', 'Presented at the Parent/Family Meeting.'),
  ('rtg2023:p:08:04', 'task', 'president', 8, 40, 'Confirm practice facilities with the AD', 'Presented at the Parent/Family Meeting.'),
  ('rtg2023:p:08:05', 'task', 'president', 8, 50, 'Confirm the budget and fee structure for each team', 'Including fundraising expectations for the organization and/or individual players and families. Presented at the Parent/Family Meeting.'),
  ('rtg2023:p:08:06', 'task', 'president', 8, 60, 'Set up a way to collect what adults would like to volunteer for', null),
  ('rtg2023:p:08:07', 'task', 'president', 8, 70, 'Confirm board member candidates', null),
  ('rtg2023:p:08:08', 'task', 'president', 8, 80, 'Plan the election of next season''s board members', 'Find people to count votes after the meeting.'),
  ('rtg2023:p:08:09', 'task', 'president', 8, 90, 'Set a date, time and place for uniform sizing', 'With the other board members.'),
  ('rtg2023:ad:08:01', 'task', 'athletic_director', 8, 10, 'Coordinate the last GS Summer Clinic sessions with coaches', null),
  ('rtg2023:ad:08:02', 'task', 'athletic_director', 8, 20, 'Attend and help coordinate JH/HS summer tournaments as needed', null),
  ('rtg2023:ad:08:03', 'task', 'athletic_director', 8, 30, 'Help with the presentation at the Parent/Family Meeting', null),
  ('rtg2023:ad:08:04', 'task', 'athletic_director', 8, 40, 'Finish the fall schedule (through December) for all teams', null),
  ('rtg2023:agenda:08:01', 'agenda', null, 8, 10, 'Fall registration', 'With the board member(s) in charge of it: the registration process, payments and so on.'),

  -- September
  ('rtg2023:p:09:01', 'task', 'president', 9, 10, 'Update the Player Handbook', 'For the presentation to players and families at the first practice in October.'),
  ('rtg2023:p:09:02', 'task', 'president', 9, 20, 'Create the application for coaching candidates and alumni helpers', null),
  ('rtg2023:p:09:03', 'task', 'president', 9, 30, 'Make sure Lightning insurance ($3 million coverage) is current', 'Before practices and facility rental start in October. Check with the treasurer that it''s paid and renews as needed, and give the AD a copy to make facility rental easier.'),
  ('rtg2023:p:09:04', 'task', 'president', 9, 40, 'Coordinate door duty at St. Marks', 'Parents and families sign up to help.'),
  ('rtg2023:ad:09:01', 'task', 'athletic_director', 9, 10, 'Confirm practice facilities for the start of practices in October', null),
  ('rtg2023:ad:09:02', 'task', 'athletic_director', 9, 20, 'Organize and hand out equipment for October practices', 'Balls, practice jerseys, med kits and so on.'),
  ('rtg2023:ad:09:03', 'task', 'athletic_director', 9, 30, 'Help coaches with initial team formation as registrations come in', null),
  ('rtg2023:ad:09:04', 'task', 'athletic_director', 9, 40, 'Tell coaches about team/coach picture night in October', 'It takes a whole practice, so there''s NO PRACTICE that night.'),
  ('rtg2023:ad:09:05', 'task', 'athletic_director', 9, 50, 'Confirm the fall schedule with other homeschool organizations for JH/HS teams', null),
  ('rtg2023:ad:09:06', 'task', 'athletic_director', 9, 60, 'Register GS teams for fall leagues', 'Fall leagues usually start in the middle of October.'),
  ('rtg2023:agenda:09:01', 'agenda', null, 9, 10, 'Approve coaches', null),
  ('rtg2023:agenda:09:02', 'agenda', null, 9, 20, 'Background checks of coaching candidates', null),
  ('rtg2023:agenda:09:03', 'agenda', null, 9, 30, 'Conversations with coaches as needed', null),
  ('rtg2023:agenda:09:04', 'agenda', null, 9, 40, 'Team and coach pictures', 'Coordinate with the board member organizing them, and include the board members doing uniforms.'),

  -- October
  ('rtg2023:p:10:01', 'task', 'president', 10, 10, 'Contact players and families who haven''t turned in the player handbook page', null),
  ('rtg2023:p:10:02', 'task', 'president', 10, 20, 'Help make sure players and families are signed up and logged into Slack', null),
  ('rtg2023:p:10:03', 'task', 'president', 10, 30, 'Start the weekly Lightning Bolt', 'Coordinate communications with the board members.'),
  ('rtg2023:p:10:04', 'task', 'president', 10, 40, 'Help hand out uniforms before picture night', null),
  ('rtg2023:p:10:05', 'task', 'president', 10, 50, 'Coordinate door duty at St. Marks', 'Parents and families sign up to help.'),
  ('rtg2023:p:10:06', 'task', 'president', 10, 60, 'Update the website with the latest practices, games and tournaments', null),
  ('rtg2023:p:10:07', 'task', 'president', 10, 70, 'Coordinate registration for the Fundamentals Program', null),
  ('rtg2023:ad:10:01', 'task', 'athletic_director', 10, 10, 'Attend the first week of practices (all teams)', 'To answer questions and deal with the issues that come up.'),
  ('rtg2023:ad:10:02', 'task', 'athletic_director', 10, 20, 'Cover door duty at St. Marks when no one else has signed up', null),
  ('rtg2023:ad:10:03', 'task', 'athletic_director', 10, 30, 'Attend the first week of games for GS/JH teams', null),
  ('rtg2023:ad:10:04', 'task', 'athletic_director', 10, 40, 'Plan the Fundamentals Program with coaches', 'Who will run it, and how? Some of it depends on how many register.'),
  ('rtg2023:ad:10:05', 'task', 'athletic_director', 10, 50, 'Make sure every HS family can see the game schedule', 'Update TeamSnap (or whatever we use for game schedules).'),
  ('rtg2023:ad:10:06', 'task', 'athletic_director', 10, 60, 'Make sure the facility has a good place for pictures on picture night', null),
  ('rtg2023:agenda:10:01', 'agenda', null, 10, 10, 'Fundamentals Program', null),
  ('rtg2023:agenda:10:02', 'agenda', null, 10, 20, 'Budget', 'Everyone has paid by now. Where are we financially? What do we need to do to stay financially solid?'),

  -- November
  ('rtg2023:p:11:01', 'task', 'president', 11, 10, 'Meet with the AD about end-of-season tournaments', 'An initial plan for the HS end-of-season tournament, and end-of-season "all star" teams for an out-of-town tournament for GS and/or JH.'),
  ('rtg2023:p:11:02', 'task', 'president', 11, 20, 'Help complete the initial registration for the HS end-of-season tournament', null),
  ('rtg2023:p:11:03', 'task', 'president', 11, 30, 'Help complete the initial hotel registration for the HS end-of-season tournament', null),
  ('rtg2023:p:11:04', 'task', 'president', 11, 40, 'Set up a December meeting with HS families about the end-of-season tournament', 'Present how it will work. It''s part of the HS season and part of what their registration fees pay for.'),
  ('rtg2023:ad:11:01', 'task', 'athletic_director', 11, 10, 'Finalize details for HS home tournaments', 'These have been in December in the past.'),
  ('rtg2023:ad:11:02', 'task', 'athletic_director', 11, 20, 'Help with the Fundamentals Program as needed', 'It starts in November.'),
  ('rtg2023:ad:11:03', 'task', 'athletic_director', 11, 30, 'Meet with coaches about end-of-season plans', 'The HS end-of-season tournament and possible GS/JH "all star" teams. The end-of-season tournament is included for HS, but NOT for GS/JH.'),
  ('rtg2023:agenda:11:01', 'agenda', null, 11, 10, 'HS end-of-season tournament', 'Discuss and approve what the coaches think is right.'),
  ('rtg2023:agenda:11:02', 'agenda', null, 11, 20, 'GS/JH "all star" teams', 'What the coaches think is right at this point in the season.'),

  -- December
  ('rtg2023:p:12:01', 'task', 'president', 12, 10, 'Coordinate HS player registration for the end-of-season tournament', 'If it''s the NCHC tournament, families MUST register on their own. Make sure every player meets the eligibility requirements, and cover all of it at the December meeting with HS families.'),
  ('rtg2023:ad:12:01', 'task', 'athletic_director', 12, 10, 'Check practice facilities for Christmas break', 'Make arrangements as needed, and tell everyone about any changed times or locations.'),
  ('rtg2023:ad:12:02', 'task', 'athletic_director', 12, 20, 'Create the Christmas Break Challenge with coach input', null),
  ('rtg2023:ad:12:03', 'task', 'athletic_director', 12, 30, 'Meet with coaches over Christmas break about GS team re-alignment', 'Do the GS teams need re-aligning for the second half of the season (winter session)? The President attends too. If so, coordinate it and how it''s presented to families so there are no hard feelings, and take it to the President for board approval and family communication. Suggestion: every GS player comes to the first practice after break as normal, then teams are adjusted (warn parents beforehand).'),
  ('rtg2023:ad:12:04', 'task', 'athletic_director', 12, 40, 'Finalize the January – March schedule for JH/HS', 'Make sure facilities are available for it.'),
  ('rtg2023:ad:12:05', 'task', 'athletic_director', 12, 50, 'Ask the Omaha Warriors about a joint Omaha Homeschool Basketball Invitational in February', null),
  ('rtg2023:ad:12:06', 'task', 'athletic_director', 12, 60, 'Make initial plans for the annual alumni/senior night', 'Make contacts as needed, make sure the facility is available, and coordinate with the board member(s) helping with senior recognition.'),
  ('rtg2023:ad:12:07', 'task', 'athletic_director', 12, 70, 'Register GS/JH teams for winter league play', 'Or whatever replaces the PELLA league.'),
  ('rtg2023:agenda:12:01', 'agenda', null, 12, 10, 'Usually no board meeting in December', 'Unless there''s important business that can''t wait.'),

  -- January
  ('rtg2023:p:01:01', 'task', 'president', 1, 10, 'Help with messaging about GS team re-alignment as needed', null),
  ('rtg2023:p:01:02', 'task', 'president', 1, 20, 'Adjust the fundraising plan as needed', 'With the treasurer and board members.'),
  ('rtg2023:p:01:03', 'task', 'president', 1, 30, 'Update the website with practice changes as needed', null),
  ('rtg2023:ad:01:01', 'task', 'athletic_director', 1, 10, 'Coordinate travel for away games in January and February', null),
  ('rtg2023:ad:01:02', 'task', 'athletic_director', 1, 20, 'Present the Christmas Challenge winners with their prize', 'Or whatever incentive we''re using.'),
  ('rtg2023:ad:01:03', 'task', 'athletic_director', 1, 30, 'Finalize travel for the HS end-of-season tournament', null),
  ('rtg2023:ad:01:04', 'task', 'athletic_director', 1, 40, 'Help GS coaches present the re-aligned GS teams to parents', 'At the first practice in January.'),
  ('rtg2023:ad:01:05', 'task', 'athletic_director', 1, 50, 'Set up a way for coaches to nominate GS/JH "all star" players', 'Nominations are due at the beginning of February.'),
  ('rtg2023:agenda:01:01', 'agenda', null, 1, 10, 'Planning for the future', 'What could we change to make next season run smoother?'),
  ('rtg2023:agenda:01:02', 'agenda', null, 1, 20, 'Choose the date, place and time for the end-of-season celebration/banquet', 'Typically sometime in March.'),
  ('rtg2023:agenda:01:03', 'agenda', null, 1, 30, 'Senior Scholarship sub-committee?', null),

  -- February
  ('rtg2023:p:02:01', 'task', 'president', 2, 10, 'Discuss initial thoughts on summer offerings with the board', 'What fits our players, families and coaches, and where the program is right now? Present it to the AD so facilities can be arranged in March.'),
  ('rtg2023:p:02:02', 'task', 'president', 2, 20, 'Design the end-of-season feedback form/survey', 'Ready to go at the beginning of March.'),
  ('rtg2023:ad:02:01', 'task', 'athletic_director', 2, 10, 'Meet with the nominated GS/JH "all star" players, with the President', 'Fill in the roster as needed when those first nominated can''t or won''t take part.'),
  ('rtg2023:ad:02:02', 'task', 'athletic_director', 2, 20, 'Run the February HS home games and tournaments', 'The AD takes care of all the details, including communication with out-of-town teams. February is tricky: plans change depending on the Lightning HS record and other teams'' records.'),
  ('rtg2023:ad:02:03', 'task', 'athletic_director', 2, 30, 'Plan a team meeting/meal before the HS end-of-season tournament', 'Same for the GS/JH "all star" teams if appropriate.'),
  ('rtg2023:agenda:02:01', 'agenda', null, 2, 10, 'Summer offerings', null),
  ('rtg2023:agenda:02:02', 'agenda', null, 2, 20, 'Informal feedback from families', 'What changes would make things better for everyone?'),
  ('rtg2023:agenda:02:03', 'agenda', null, 2, 30, 'GS/JH end-of-season "all star" teams', 'Who is involved? Where will they play?'),

  -- March
  ('rtg2023:p:03:01', 'task', 'president', 3, 10, 'MC and organize the End of Season Celebration/Banquet', 'Awards, recognitions and the other details for the night, including the Scholarship Award.'),
  ('rtg2023:ad:03:01', 'task', 'athletic_director', 3, 10, 'Collect equipment from coaches for summer storage', 'All balls, practice jerseys, med kits and so on, for storage and evaluation over the summer.'),
  ('rtg2023:ad:03:02', 'task', 'athletic_director', 3, 20, 'Set up the end-of-season meeting with coaches', 'Late March or early April. Invite the President to go over the feedback from families.'),
  ('rtg2023:ad:03:03', 'task', 'athletic_director', 3, 30, 'Reserve facilities for summer offerings', 'Make the initial contacts so it''s settled by April.'),
  ('rtg2023:agenda:03:01', 'agenda', null, 3, 10, 'Season wrap-up and the end-of-season survey', 'Assign board members to go through the results and report the trends they find.'),
  ('rtg2023:agenda:03:02', 'agenda', null, 3, 20, 'Finalize summer offerings', 'So the AD can reserve facilities this month.'),
  ('rtg2023:agenda:03:03', 'agenda', null, 3, 30, 'Create registration for summer offerings', null),
  ('rtg2023:agenda:03:04', 'agenda', null, 3, 40, 'Budget clean-up from the season', 'Usually needed. UNO is notorious for being very slow on billing.'),

  -- April
  ('rtg2023:p:04:01', 'task', 'president', 4, 10, 'Work on next season''s budget', 'With the treasurer and other board volunteers.'),
  ('rtg2023:p:04:02', 'task', 'president', 4, 20, 'Get summer registration, flyers and information ready to go', null),
  ('rtg2023:ad:04:01', 'task', 'athletic_director', 4, 10, 'Finalize which coaches cover summer programs for GS, JH and HS', 'Look at registrations and decide how to make it meaningful and fun for the players. This changes year to year, depending on who''s playing summer basketball and their skill level.'),
  ('rtg2023:ad:04:02', 'task', 'athletic_director', 4, 20, 'Make initial contacts about next season''s HS schedule', 'Who wants to play us? What worked well last season that we want to keep doing?'),

  -- May
  ('rtg2023:p:05:01', 'task', 'president', 5, 10, 'Continue next season''s budget and reconcile last season''s', 'Complete and reconcile last season''s budget with the treasurer, including reimbursing coaches'' end-of-season tournament hotel rooms (if we''re doing that) and paying for summer program facilities.'),
  ('rtg2023:p:05:02', 'task', 'president', 5, 20, 'Finalize summer "fun events" for players and families', 'And let everyone know about them.'),
  ('rtg2023:p:05:03', 'task', 'president', 5, 30, 'Make initial contacts for future board members', 'Which spots need filling? Start with the AD position; that person needs to get up to speed quickly.'),
  ('rtg2023:ad:05:01', 'task', 'athletic_director', 5, 10, 'Work on the HS schedule', 'When will the HS teams travel? Work with the President to get feedback from HS parents. This changes year to year, depending on what families want and the team''s skill level.'),
  ('rtg2023:ad:05:02', 'task', 'athletic_director', 5, 20, 'Help with summer offerings as needed', null),
  ('rtg2023:agenda:05:01', 'agenda', null, 5, 10, 'Usually no board meeting in May', 'Unless there''s important business that can''t wait.'),

  -- June
  ('rtg2023:p:06:01', 'task', 'president', 6, 10, 'Finalize next season''s budget', null),
  ('rtg2023:p:06:02', 'task', 'president', 6, 20, 'Discuss by-law changes', 'For approval in July and presentation to everyone in August.'),
  ('rtg2023:p:06:03', 'task', 'president', 6, 30, 'Coordinate next season''s HS schedule with the AD', 'Does the GS/JH schedule need changes, or do we keep similar games and tournaments?'),
  ('rtg2023:p:06:04', 'task', 'president', 6, 40, 'Finalize board member candidates for next season', 'Invite them to the June board meeting to get up to speed. Usually there''s one candidate per position, so the August vote is a formality; if more parents are interested than there are positions, decide how to move forward.'),
  ('rtg2023:ad:06:01', 'task', 'athletic_director', 6, 10, 'Help with summer offerings as needed', null),
  ('rtg2023:ad:06:02', 'task', 'athletic_director', 6, 20, 'Check in with coaches about next season', 'Is anyone stepping away from coaching? Will any coach shift teams (move up with his team, or with his son as he gets older)? Report it to the President.'),
  ('rtg2023:ad:06:03', 'task', 'athletic_director', 6, 30, 'Make headway on next season''s facilities', 'What can be confirmed and locked in already? What obvious problems are coming?'),
  ('rtg2023:agenda:06:01', 'agenda', null, 6, 10, 'A June board meeting is only sometimes needed', 'It depends on what needs to be approved by the board.'),

  -- July
  ('rtg2023:p:07:01', 'task', 'president', 7, 10, 'Share all files and information with the new President', 'If a new President starts in August.'),
  ('rtg2023:p:07:02', 'task', 'president', 7, 20, 'Meet with the AD about next season''s schedule', 'What HS schedule are we looking at? What changes, if any, do the coaches and AD feel the GS/JH schedule needs? This shapes the Parent/Family Meeting presentation.'),
  ('rtg2023:ad:07:01', 'task', 'athletic_director', 7, 10, 'Help with summer offerings as needed', null),
  ('rtg2023:ad:07:02', 'task', 'athletic_director', 7, 20, 'Share all files and information with the new AD', 'If a new AD starts in August.'),
  ('rtg2023:ad:07:03', 'task', 'athletic_director', 7, 30, 'Gauge coaching interest from current coaches', 'Who will be stepping away from coaching next season? The President asks too.'),
  ('rtg2023:agenda:07:01', 'agenda', null, 7, 10, 'A July board meeting is only sometimes needed', 'It depends on what needs to be approved by the board.')
) as v(seed_key, kind, role_key, month, sort_order, title, notes)
left join public.planning_roles r on r.seed_key = 'role:' || v.role_key
on conflict (seed_key) do nothing;

commit;
