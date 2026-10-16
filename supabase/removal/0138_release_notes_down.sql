-- Down for 0138_release_notes.sql
-- Drops the seen-marker for Settings → Release Notes.

begin;

alter table public.members drop column if exists releases_seen_version;

notify pgrst, 'reload schema';

commit;
