-- 0162_game_film_youtube_auth_error_down.sql
--
-- Removes the YouTube sign-in error columns (0162). Kept outside
-- supabase/migrations so it never runs by accident. Run it in the Supabase
-- SQL editor only after the code that reads these columns is gone.
--
-- Idempotent.

begin;

alter table public.game_film_youtube
  drop column if exists auth_error,
  drop column if exists auth_error_at;

commit;

notify pgrst, 'reload schema';
