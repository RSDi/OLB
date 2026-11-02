-- 0162_game_film_youtube_auth_error.sql
--
-- Remembers why the YouTube upload job couldn't sign in (usually Google
-- ending the login after 7 days while the OAuth app is in Testing), so
-- Settings → Film and the Film pages can say so instead of leaving films
-- queued with no explanation. The cron sets it when the token refresh
-- fails and clears it on the next good refresh or on Connect/Disconnect.
--
-- No new table, sequence or function, so no Data API grants. The table
-- stays service-role only (0144).
-- To remove: supabase/removal/0162_game_film_youtube_auth_error_down.sql.
-- Idempotent.

begin;

alter table public.game_film_youtube
  add column if not exists auth_error text,
  add column if not exists auth_error_at timestamptz;

commit;

notify pgrst, 'reload schema';
