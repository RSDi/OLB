-- 0126_drop_closures.sql
--
-- Closures came over from the MCC site: a "not meeting this week" notice for
-- the public Meeting Times page and its printable door sign. OLB doesn't use
-- either, and the pages, the Settings → Closures tab and lib/closures are
-- gone, so drop the tables (empty in OLB) and the audit trigger's function.
-- Dropping the tables takes their policies, indexes and triggers with them.
--
-- Apply via the Supabase SQL editor, after 0125. Idempotent.

drop table if exists public.closures;
drop table if exists public.closure_reasons;
drop function if exists public.closures_set_audit_fields();
