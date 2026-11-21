-- 0177_film_watch_page.sql
--
-- Team film page: one public link per team (/watch/<film_slug>) where
-- families watch every game, grouped by tournament or weekend.
--
--   olb_teams.film_watch_public     the team's watch page is on. Off by
--                                   default; Settings → Film turns it on.
--   game_film_uploads.event_name    the tournament or event a game belongs
--                                   to ("Heartland Hoops Classic"). Games
--                                   without one group by weekend.
--
-- Adds columns to existing tables, so no new Data API grants. The page reads
-- through the admin client after checking film_watch_public. Idempotent.

alter table public.olb_teams
  add column if not exists film_watch_public boolean not null default false;

alter table public.game_film_uploads
  add column if not exists event_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'game_film_uploads_event_name_len'
  ) then
    alter table public.game_film_uploads
      add constraint game_film_uploads_event_name_len
      check (event_name is null or char_length(event_name) between 1 and 80);
  end if;
end $$;
