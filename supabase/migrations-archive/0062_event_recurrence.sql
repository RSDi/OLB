-- Building-shutdown wizard, Phase 2c: recurring events auto-spawn shutdown tasks.
--
-- Events gain a weekly recurrence rule (same model as the request resolver:
-- weekdays + an until date). A daily cron expands each recurring,
-- shutdown-linked event into upcoming occurrence dates and creates one dated,
-- unassigned shutdown task per occurrence — staff then assign each to a team
-- member, who works it exactly like a Phase 2b shutdown.
begin;

-- Weekly recurrence on events. recur_weekdays uses 0=Sun…6=Sat (matches
-- lib/requests/recurrence.ts). Only meaningful when recurring = true.
alter table public.events
  add column if not exists recurring     boolean not null default false,
  add column if not exists recur_weekdays int[],
  add column if not exists recur_until    date;

-- The specific date a shutdown task covers. For a one-off event it's the event
-- date; for a recurring event there's one task per occurrence date.
alter table public.maintenance_requests
  add column if not exists occurrence_date date;

-- Idempotency for the generator: at most one live shutdown task per
-- (event, occurrence date). Lets the cron run repeatedly without duplicating.
create unique index if not exists maintenance_requests_event_occurrence_uniq
  on public.maintenance_requests (event_id, occurrence_date)
  where event_id is not null and occurrence_date is not null and deleted_at is null;

commit;
