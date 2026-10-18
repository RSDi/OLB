-- 0148_game_film_youtube_templates_down.sql
--
-- Removes YouTube templates, Slack drafts, and game lineups (0148).
-- Kept outside supabase/migrations so it never runs by accident. Run it
-- in the Supabase SQL editor only after the Film / Settings → Film code
-- that reads these columns and tables is gone.
--
-- Team film codes, playlists, and uploads stay. Idempotent.

begin;

drop table if exists public.game_film_lineup_players;
drop table if exists public.game_film_lineups;
drop table if exists public.game_film_slack_drafts;

alter table public.olb_teams
  drop column if exists film_youtube_title_template,
  drop column if exists film_youtube_description_template,
  drop column if exists film_include_stats_book,
  drop column if exists film_include_players,
  drop column if exists film_include_tournament,
  drop column if exists film_include_playlist_link,
  drop column if exists film_slack_channel_id;

commit;

notify pgrst, 'reload schema';
