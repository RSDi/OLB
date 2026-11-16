-- 0174_film_youtube_worker_health.sql
--
-- The every-minute YouTube worker records whether it could reach YouTube.
-- When the club login expires the worker used to skip silently and every
-- video sat at "Queued". The film page now reads worker_error and says
-- what's wrong. Columns only; the table stays service-role only (0144).

alter table public.game_film_youtube
  add column if not exists worker_error    text,
  add column if not exists worker_error_at timestamptz,
  add column if not exists worker_ok_at    timestamptz;
