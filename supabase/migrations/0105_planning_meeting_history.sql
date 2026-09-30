-- 0105_planning_meeting_history.sql
--
-- Board meetings (Planning → a month's Board meeting, migration 0104) get a
-- history of who changed what, and protection against two people saving over
-- each other.
--
--   planning_meetings.revision        counts saved changes to a meeting's
--   planning_meeting_notes.revision   date, status, agenda and minutes (or
--                                     to one task's note). The app saves
--                                     only if the row is still at the
--                                     revision it merged against, so a
--                                     save that raced another is caught and
--                                     merged again instead of overwriting it.
--   planning_meeting_versions         every saved state of a meeting, with
--                                     who saved it. The meeting's History
--                                     page lists them and can restore one.
--   planning_meeting_note_versions    every change to a task note (added,
--                                     edited, removed), with who made it.
--
-- The version rows are written by triggers, so no save can skip them, and
-- only the board can read them. Nobody can edit or delete history from the
-- app (no insert, update or delete policies).
--
-- Also: Realtime authorization for the meeting page's live "who's here" and
-- "just saved" notices (private channels named planning-meeting:YYYY-MM),
-- limited to the board. Skipped where the realtime schema isn't there.
--
-- Apply via the Supabase SQL editor, after 0104. Idempotent.

begin;

-- ─── Revisions ──────────────────────────────────────────────────────────────

alter table public.planning_meetings
  add column if not exists revision int not null default 1;

alter table public.planning_meeting_notes
  add column if not exists revision int not null default 1;

-- A real change moves the revision on; saving the same values again doesn't.
create or replace function public.planning_meetings_bump_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.meets_on, new.status, new.agenda_md, new.minutes_md)
     is distinct from (old.meets_on, old.status, old.agenda_md, old.minutes_md) then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end;
$$;

drop trigger if exists planning_meetings_bump_revision on public.planning_meetings;
create trigger planning_meetings_bump_revision
  before update on public.planning_meetings
  for each row execute function public.planning_meetings_bump_revision();

create or replace function public.planning_meeting_notes_bump_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.note_md is distinct from old.note_md then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end;
$$;

drop trigger if exists planning_meeting_notes_bump_revision on public.planning_meeting_notes;
create trigger planning_meeting_notes_bump_revision
  before update on public.planning_meeting_notes
  for each row execute function public.planning_meeting_notes_bump_revision();

-- ─── Meeting versions ───────────────────────────────────────────────────────

create table if not exists public.planning_meeting_versions (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.planning_meetings(id) on delete cascade,
  revision    int not null,
  meets_on    date,
  status      text not null,
  agenda_md   text not null,
  minutes_md  text not null,
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now()
);

create index if not exists planning_meeting_versions_meeting_idx
  on public.planning_meeting_versions (meeting_id, changed_at desc);

create or replace function public.planning_meetings_write_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only saved changes, not a save that changed nothing.
  if tg_op = 'UPDATE' and new.revision = old.revision then
    return null;
  end if;
  insert into public.planning_meeting_versions
    (meeting_id, revision, meets_on, status, agenda_md, minutes_md, changed_by)
  values
    (new.id, new.revision, new.meets_on, new.status, new.agenda_md, new.minutes_md,
     coalesce(auth.uid(), new.updated_by));
  return null;
end;
$$;

drop trigger if exists planning_meetings_write_version on public.planning_meetings;
create trigger planning_meetings_write_version
  after insert or update on public.planning_meetings
  for each row execute function public.planning_meetings_write_version();

alter table public.planning_meeting_versions enable row level security;

drop policy if exists "planning_meeting_versions_select_staff" on public.planning_meeting_versions;
create policy "planning_meeting_versions_select_staff" on public.planning_meeting_versions
  for select to authenticated
  using ((select public.is_staff()));

-- ─── Note versions ──────────────────────────────────────────────────────────

create table if not exists public.planning_meeting_note_versions (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.planning_meetings(id) on delete cascade,
  task_id     uuid not null references public.maintenance_requests(id) on delete cascade,
  -- Null: the note was removed.
  note_md     text,
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now()
);

create index if not exists planning_meeting_note_versions_meeting_idx
  on public.planning_meeting_note_versions (meeting_id, changed_at desc);

create index if not exists planning_meeting_note_versions_task_idx
  on public.planning_meeting_note_versions (task_id);

create or replace function public.planning_meeting_notes_write_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- A note removed along with its meeting or task leaves no history to keep.
    if not exists (select 1 from public.planning_meetings where id = old.meeting_id)
       or not exists (select 1 from public.maintenance_requests where id = old.task_id) then
      return null;
    end if;
    insert into public.planning_meeting_note_versions (meeting_id, task_id, note_md, changed_by)
    values (old.meeting_id, old.task_id, null, auth.uid());
    return null;
  end if;
  if tg_op = 'UPDATE' and new.note_md is not distinct from old.note_md then
    return null;
  end if;
  insert into public.planning_meeting_note_versions (meeting_id, task_id, note_md, changed_by)
  values (new.meeting_id, new.task_id, new.note_md, coalesce(auth.uid(), new.updated_by));
  return null;
end;
$$;

drop trigger if exists planning_meeting_notes_write_version on public.planning_meeting_notes;
create trigger planning_meeting_notes_write_version
  after insert or update or delete on public.planning_meeting_notes
  for each row execute function public.planning_meeting_notes_write_version();

alter table public.planning_meeting_note_versions enable row level security;

drop policy if exists "planning_meeting_note_versions_select_staff" on public.planning_meeting_note_versions;
create policy "planning_meeting_note_versions_select_staff" on public.planning_meeting_note_versions
  for select to authenticated
  using ((select public.is_staff()));

-- Meetings saved before this migration start their history at what they
-- hold now.
insert into public.planning_meeting_versions
  (meeting_id, revision, meets_on, status, agenda_md, minutes_md, changed_by, changed_at)
select m.id, m.revision, m.meets_on, m.status, m.agenda_md, m.minutes_md,
       coalesce(m.updated_by, m.created_by), m.updated_at
from public.planning_meetings m
where not exists (select 1 from public.planning_meeting_versions v where v.meeting_id = m.id);

insert into public.planning_meeting_note_versions (meeting_id, task_id, note_md, changed_by, changed_at)
select n.meeting_id, n.task_id, n.note_md, n.updated_by, n.updated_at
from public.planning_meeting_notes n
where not exists (
  select 1 from public.planning_meeting_note_versions v
  where v.meeting_id = n.meeting_id and v.task_id = n.task_id
);

-- ─── Realtime: who's on a meeting page ──────────────────────────────────────
-- The page joins the private channel planning-meeting:YYYY-MM to show who
-- else has it open and to hear when someone saves. Board only.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'realtime' and table_name = 'messages'
  ) then
    execute 'drop policy if exists "planning_meeting_channel_read_staff" on realtime.messages';
    execute $p$
      create policy "planning_meeting_channel_read_staff" on realtime.messages
        for select to authenticated
        using (
          (select realtime.topic()) like 'planning-meeting:%'
          and (select public.is_staff())
        )
    $p$;
    execute 'drop policy if exists "planning_meeting_channel_write_staff" on realtime.messages';
    execute $p$
      create policy "planning_meeting_channel_write_staff" on realtime.messages
        for insert to authenticated
        with check (
          (select realtime.topic()) like 'planning-meeting:%'
          and (select public.is_staff())
        )
    $p$;
  end if;
end;
$$;

commit;
