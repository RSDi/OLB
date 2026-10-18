-- 0146_agent_keys.sql
--
-- Hashed read-only keys for /api/agent/*. Super-admins mint them in
-- Settings → Agent keys. Plaintext is shown once; only the hash is stored.
-- No grant to authenticated: the app uses the service role after a
-- super-admin check (same shape as game_film_youtube).
--
-- Numbering: 0146 is this PR. Apply after 0145. Later film PRs are 0147
-- (YouTube privacy) then 0148 (templates). 0149 is reserved for the
-- email-archive PR. 0150_hosted_tournaments.sql is already on main.
-- To remove: supabase/removal/0146_agent_keys_down.sql.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0145. Idempotent.

begin;

create table if not exists public.olb_agent_keys (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  key_prefix  text not null,
  key_hash    text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint olb_agent_keys_name_len check (char_length(name) between 1 and 80),
  constraint olb_agent_keys_prefix_len check (char_length(key_prefix) between 8 and 32)
);

create index if not exists olb_agent_keys_active_idx
  on public.olb_agent_keys (created_at desc)
  where revoked_at is null;

alter table public.olb_agent_keys enable row level security;

revoke all on table public.olb_agent_keys from public, anon, authenticated;

commit;
