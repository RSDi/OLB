-- 0051_vendors_budgets.sql
--
-- A3: vendors, budgets, reorder alerts.
--
-- Vendors themselves are the existing `contacts` table (0037) — already
-- linkable to tasks via contact_links. This migration wires them to supplies
-- ("this is who we reorder from") and adds the lean budget fields:
--
--   supplies.reorder_contact_id — the vendor to reorder this supply from
--   supplies.reorder_note       — SKU / link / "order 2 boxes" hint
--   projects.budget             — dollars the committee set aside
--   maintenance_requests.cost   — actual dollars a task ended up costing;
--                                 the project page sums these against budget
--
-- Threshold-crossing notifications are app-side (the supply mutations know
-- the before/after counts) — no triggers here. Columns inherit each table's
-- existing RLS.
--
-- Idempotent; safe to re-run.

begin;

alter table public.supplies
  add column if not exists reorder_contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists reorder_note text;

alter table public.projects
  add column if not exists budget numeric(10,2);

alter table public.maintenance_requests
  add column if not exists cost numeric(10,2);

commit;
