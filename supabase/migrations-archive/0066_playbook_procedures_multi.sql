-- 0066_playbook_procedures_multi.sql
--
-- Multiple procedures per playbook. Until now a "playbook" carried at most ONE
-- checklist, stored inline as playbooks.steps + wizard_slack_channel +
-- wizard_completion_message (0059). A playbook like "Soundbooth" really has
-- several procedures (Startup, Shutdown/End-of-service), each with its own
-- notify behavior. This promotes procedures to a child table.
--
--   playbook_procedures  — a named, ordered checklist belonging to a playbook,
--                          with its own notify config (notify on/off + channel
--                          + completion message).
--   procedure_runs       — a completion log (who + when), newest-first, so a
--                          procedure that's "just logged as done" still has a
--                          history.
--   events.shutdown_procedure_id — the building-shutdown wizard now points at a
--                          specific procedure (was: a playbook).
--
-- Backfill seeds one procedure per currently-runnable playbook and repoints
-- each shutdown-linked event at it, so nothing breaks. The legacy
-- playbooks.steps/wizard_* columns and events.shutdown_playbook_id are left in
-- place (unused) — no data is dropped. Idempotent.
--
-- Depends on 0029 (playbooks), 0059 (inline steps), 0060 (events.shutdown_playbook_id),
-- and 0001 (is_staff/is_super_admin).

begin;

-- ---------------------------------------------------------------------------
-- 1. playbook_procedures
-- ---------------------------------------------------------------------------
create table if not exists public.playbook_procedures (
  id                  uuid primary key default gen_random_uuid(),
  playbook_id         uuid not null references public.playbooks(id) on delete cascade,
  title               text not null default 'Procedure',
  -- Ordered checklist, same shape as the old inline column: [{ "label": "..." }].
  steps               jsonb not null default '[]'::jsonb,
  -- Per-procedure notify config. notify=false → "just log it as done" (a
  -- procedure_runs row is still written, but no Slack post).
  notify              boolean not null default false,
  slack_channel       text,
  completion_message  text,
  sort_order          int not null default 0,
  created_by          uuid references auth.users(id),
  updated_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index if not exists playbook_procedures_playbook_idx
  on public.playbook_procedures (playbook_id, sort_order)
  where deleted_at is null;

-- Stamp authorship + updated_at; clients can't spoof created_by/updated_by.
create or replace function public.playbook_procedures_set_audit_fields()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
  elsif TG_OP = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists playbook_procedures_set_audit_fields on public.playbook_procedures;
create trigger playbook_procedures_set_audit_fields
  before insert or update on public.playbook_procedures
  for each row execute function public.playbook_procedures_set_audit_fields();

alter table public.playbook_procedures enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'playbook_procedures'
  loop execute format('drop policy if exists %I on public.playbook_procedures', r.policyname); end loop;
end $$;

-- Mirrors playbooks RLS: any authenticated user reads live rows; staff write;
-- super-admin sees soft-deleted + can delete.
create policy "playbook_procedures_select_authenticated" on public.playbook_procedures
  for select to authenticated using (deleted_at is null);
create policy "playbook_procedures_select_deleted_super" on public.playbook_procedures
  for select to authenticated using (deleted_at is not null and public.is_super_admin());
create policy "playbook_procedures_insert_staff" on public.playbook_procedures
  for insert to authenticated with check (public.is_staff());
create policy "playbook_procedures_update_staff" on public.playbook_procedures
  for update to authenticated using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);
create policy "playbook_procedures_update_super" on public.playbook_procedures
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "playbook_procedures_delete_super" on public.playbook_procedures
  for delete to authenticated using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 2. procedure_runs — completion log (newest-first history)
-- ---------------------------------------------------------------------------
create table if not exists public.procedure_runs (
  id            uuid primary key default gen_random_uuid(),
  procedure_id  uuid not null references public.playbook_procedures(id) on delete cascade,
  ran_by        uuid references public.members(id) on delete set null,
  -- Display name snapshot, so history reads right even if a member is removed.
  ran_by_name   text,
  ran_at        timestamptz not null default now(),
  -- Whether a Slack notification was posted for this run.
  notified      boolean not null default false,
  -- Where it was run from: 'playbook' | 'task'.
  source        text,
  note          text
);

create index if not exists procedure_runs_procedure_idx
  on public.procedure_runs (procedure_id, ran_at desc);

alter table public.procedure_runs enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'procedure_runs'
  loop execute format('drop policy if exists %I on public.procedure_runs', r.policyname); end loop;
end $$;

-- Run history is staff-only to read. All inserts go through the admin client in
-- the completion actions (app-layer gating), so no insert policy is needed.
create policy "procedure_runs_select_staff" on public.procedure_runs
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- 3. events.shutdown_procedure_id — point the shutdown wizard at a procedure
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists shutdown_procedure_id uuid references public.playbook_procedures(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------------
-- 4a. One procedure per currently-runnable playbook (carries its inline steps
-- + wizard config). notify=true only where a channel was set.
insert into public.playbook_procedures
  (playbook_id, title, steps, notify, slack_channel, completion_message, sort_order)
select
  p.id,
  'Procedure',
  p.steps,
  (p.wizard_slack_channel is not null and p.wizard_slack_channel <> ''),
  p.wizard_slack_channel,
  p.wizard_completion_message,
  0
from public.playbooks p
where p.deleted_at is null
  and p.steps is not null
  and jsonb_array_length(p.steps) > 0
  and not exists (
    select 1 from public.playbook_procedures pp where pp.playbook_id = p.id
  );

-- 4b. Repoint each shutdown-linked event at its playbook's (single, backfilled)
-- procedure.
update public.events e
set shutdown_procedure_id = pp.id
from public.playbook_procedures pp
where pp.playbook_id = e.shutdown_playbook_id
  and pp.sort_order = 0
  and pp.deleted_at is null
  and e.shutdown_playbook_id is not null
  and e.shutdown_procedure_id is null;

commit;
