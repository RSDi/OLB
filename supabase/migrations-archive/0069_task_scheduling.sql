-- 0069_task_scheduling.sql
--
-- Borrow "Things"-style scheduling onto tasks. Adds three optional fields to
-- maintenance_requests so a task can be:
--   • scheduled to start on a day  (start_on) — a "later" item until that day,
--   • parked for "Someday"          (someday) — out of the active view,
--   • given a hard deadline         (due_on)  — distinct from when it starts.
--
-- These power the clean queue views (Active / Upcoming / Someday / Done). Every
-- existing row defaults to "Active, unscheduled, no deadline" (start_on/due_on
-- NULL, someday false), so nothing moves on apply — no backfill needed.
--
-- Someday vs a start date are mutually exclusive in practice; that's enforced in
-- the app (the schedule action clears one when setting the other) rather than a
-- DB CHECK, to keep this flexible and idempotent.
--
-- No new table, no RLS change — the existing maintenance_requests policies cover
-- these columns. set_updated_at() already bumps updated_at on edit.
--
-- Idempotent; safe to re-run.

begin;

alter table public.maintenance_requests
  add column if not exists start_on date,
  add column if not exists someday  boolean not null default false,
  add column if not exists due_on   date;

-- Partial indexes matching the queue's filter predicates (all gated to live rows).
create index if not exists maintenance_requests_start_on_idx
  on public.maintenance_requests (start_on)
  where deleted_at is null;

create index if not exists maintenance_requests_due_on_idx
  on public.maintenance_requests (due_on)
  where deleted_at is null and due_on is not null;

create index if not exists maintenance_requests_someday_idx
  on public.maintenance_requests (someday)
  where deleted_at is null and someday = true;

commit;
