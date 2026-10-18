-- 0147_game_film_youtube_privacy_down.sql
--
-- Removes the read-only YouTube privacy / processing columns (0147).
-- Kept outside supabase/migrations so it never runs by accident. Run it
-- in the Supabase SQL editor only after the Film inbox code that reads
-- these columns is gone.
--
-- Idempotent.

begin;

drop index if exists public.game_film_uploads_youtube_synced_at_idx;

alter table public.game_film_uploads
  drop column if exists youtube_privacy,
  drop column if exists youtube_processing,
  drop column if exists youtube_synced_at;

commit;

notify pgrst, 'reload schema';
