-- 0163_agent_contacts_read.sql
--
-- Agent keys (0146, scopes 0149) learn a third permission, `contacts:read`
-- ("Read External Contacts" in Settings → Agent keys). It lets a club agent
-- look up External Contacts by email over GET /api/agent/contacts. Read only;
-- no new tables, so no Data API grants.
--
-- Apply via the Supabase SQL editor, after 0149. Idempotent.

alter table public.olb_agent_keys drop constraint if exists olb_agent_keys_scopes_valid;
alter table public.olb_agent_keys
  add constraint olb_agent_keys_scopes_valid
  check (
    cardinality(scopes) >= 1
    and scopes <@ array['read', 'email_archive:write', 'contacts:read']::text[]
  );
