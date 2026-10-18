-- 0151_game_film_youtube_progress_down.sql
--
-- Removes YouTube progress columns and the event history table (0151).
-- Kept outside supabase/migrations so it never runs by accident. Run it
-- in the Supabase SQL editor only after the Film / Film status code that
-- reads these columns and rows is gone.
--
-- Uploads, the YouTube connection, and job rows stay. Idempotent.

begin;

drop table if exists public.game_film_youtube_events;

alter table public.game_film_youtube_jobs
  drop column if exists started_at,
  drop column if exists last_progress_at,
  drop column if exists bytes_total;

commit;

notify pgrst, 'reload schema';
