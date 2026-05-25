-- 0007_drop_legacy_columns.sql
--
-- Drops the original `location` (text) and `priority` (text) columns from
-- maintenance_requests. They were preserved as a safety net during the move
-- to area_id / priority_id FKs in migration 0005; nothing reads them anymore
-- and createTicket no longer writes them.
--
-- Idempotent — re-running after the columns are gone is a no-op.

begin;

alter table public.maintenance_requests
  drop column if exists location,
  drop column if exists priority;

commit;
