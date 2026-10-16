-- Down for 0138_release_notes.sql
-- Drops Settings → Release Notes. Roadmap items are unchanged.

begin;

drop trigger if exists olb_release_notes_set_updated_at on public.olb_release_notes;
drop table if exists public.olb_release_notes;

notify pgrst, 'reload schema';

commit;
