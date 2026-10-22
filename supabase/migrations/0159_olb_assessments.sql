-- 0159_olb_assessments.sql
--
-- Assessments: named tryouts (14U, high school, …) with an age and/or grade
-- rule, a date, a place, intro copy, an open flag, and optional wording
-- for the thanks and reminder emails. Several can be open at once.
--
-- Additive only. Does not change existing tables. Seeds the 14U assessment
-- on the current season's board so /assessments/14u and /14u-assessment
-- keep working after this file is applied. Do not apply on production
-- until Jeff says so.
--
-- Access: staff (and Registrations) can read. Writes go through the
-- service role after the app checks the Registrations permission — same
-- as other registration settings. The public form also reads through the
-- service role. Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0158. Idempotent.

begin;

create table if not exists public.olb_assessments (
  id                 uuid primary key default gen_random_uuid(),
  board_id           uuid not null references public.olb_boards(id) on delete cascade,
  slug               text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) between 1 and 60),
  name               text not null check (length(name) between 1 and 120),
  level              text check (level is null or length(level) <= 20),
  dob_from           date,
  dob_to             date,
  grade_from         smallint check (grade_from is null or grade_from between 1 and 12),
  grade_to           smallint check (grade_to is null or grade_to between 1 and 12),
  starts_at          timestamptz,
  place              text check (place is null or length(place) <= 200),
  details            text not null default '' check (length(details) <= 4000),
  open               boolean not null default false,
  thanks_subject     text check (thanks_subject is null or length(thanks_subject) <= 200),
  thanks_body        text check (thanks_body is null or length(thanks_body) <= 4000),
  reminder_subject   text check (reminder_subject is null or length(reminder_subject) <= 200),
  reminder_body      text check (reminder_body is null or length(reminder_body) <= 4000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null,
  unique (board_id, slug),
  check (dob_from is null or dob_to is null or dob_from <= dob_to),
  check (grade_from is null or grade_to is null or grade_from <= grade_to)
);

create index if not exists olb_assessments_board_open_idx
  on public.olb_assessments (board_id, open, starts_at);

alter table public.olb_assessments enable row level security;

revoke all on public.olb_assessments from anon;

drop policy if exists "olb_assessments_select" on public.olb_assessments;
create policy "olb_assessments_select" on public.olb_assessments
  for select to authenticated
  using ((select public.is_staff()) or (select public.can_manage_registrations()));

drop policy if exists "olb_assessments_insert" on public.olb_assessments;
drop policy if exists "olb_assessments_update" on public.olb_assessments;
drop policy if exists "olb_assessments_delete" on public.olb_assessments;

grant select on public.olb_assessments to authenticated, service_role;
grant insert, update, delete on public.olb_assessments to service_role;

-- 14U is the first assessment. Birthday window matches the existing 14U
-- lock (lowestEligibleLevel === 14U on season end 2026-12-31): 2012-01-01
-- through 2013-12-31. That is not the August 1 fee window (14u fees are
-- ages 13–14 on 2026-08-01, about 2011-08-02 through 2013-08-01).
-- Board is the same season seasonBoardId() uses (REGISTRATION_SEASON).
insert into public.olb_assessments (
  board_id, slug, name, level, dob_from, dob_to, details, open
)
select
  b.id,
  '14u',
  '14U assessment',
  '14U',
  '2012-01-01',
  '2013-12-31',
  'We are accepting two more players at the 14U level. Please sign up for an assessment if you are interested in being considered. Playing for Omaha Lightning is a commitment to a competitive team, October through February. Practices have already begun, so assessments will be immediate.',
  true
from public.olb_boards b
where b.season = '2026-2027'
on conflict (board_id, slug) do nothing;

notify pgrst, 'reload schema';

commit;
