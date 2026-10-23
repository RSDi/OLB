-- 0159_game_film_youtube_resume_down.sql
--
-- Removes the YouTube resume/lease columns (0159). Kept outside
-- supabase/migrations so it never runs by accident. Run it in the
-- Supabase SQL editor only after the worker no longer reads these
-- columns. Idempotent.

begin;

alter table public.game_film_youtube_jobs
  drop column if exists next_attempt_at,
  drop column if exists claimed_until,
  drop column if exists claimed_by,
  drop column if exists transient_attempts;

commit;

notify pgrst, 'reload schema';
