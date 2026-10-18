-- 0146_agent_keys_down.sql
--
-- Removes hashed read-only agent keys (0146). Kept outside
-- supabase/migrations so it never runs by accident. Run it in the Supabase
-- SQL editor only after the Settings → Agent keys code is gone.
--
-- Idempotent.

begin;

drop table if exists public.olb_agent_keys;

commit;

notify pgrst, 'reload schema';
