-- 0138_release_notes.sql
--
-- Settings → Release Notes. The notes themselves live in code
-- (lib/release-notes/releases.ts), newest first, with versions derived from
-- position. This migration only stores each member's "seen up to" version,
-- so the What's new toast (and the panel's acknowledgement) follow them
-- from phone to computer.
--
-- members.releases_seen_version  text, nullable. The member updates their
-- own row (members_self_update); the column-guard trigger allows it because
-- it isn't an admin-managed field.
--
-- Apply via the Supabase SQL editor, after 0137. Idempotent.

begin;

alter table public.members
  add column if not exists releases_seen_version text;

notify pgrst, 'reload schema';

commit;
