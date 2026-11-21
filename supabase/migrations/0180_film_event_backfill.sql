-- 0180_film_event_backfill.sql
--
-- One-time backfill: games already on Film with no tournament get the HS
-- Schedule's tournament when the game date falls on its weekend, the same
-- rule new uploads follow (lib/film/tournaments.ts, tournaments-data.ts):
--
--   the team's columns (hs_levels.team_id) → their seasons → weekends with
--   an event name, not canceled or off, starts_on <= game_date <= ends_on.
--
-- The name is trimmed, inner spaces collapsed, and cut to 80 characters
-- (game_film_uploads_event_name_len). Only games with no tournament change:
-- a name a coach typed is kept. (One a coach cleared is also empty, so it
-- gets the schedule's; Edit can set None again.) If two weekends overlap a
-- date, the one that starts later wins. Data only: no new objects, no
-- grants. Safe to run again.

with matches as (
  select distinct on (u.id)
    u.id,
    btrim(left(regexp_replace(btrim(w.event), '\s+', ' ', 'g'), 80)) as event_name
  from public.game_film_uploads u
  join public.hs_levels l on l.team_id = u.team_id
  join public.hs_weekends w on w.season_id = l.season_id
  where u.event_name is null
    and u.game_date is not null
    and u.game_date between w.starts_on and w.ends_on
    and btrim(w.event) <> ''
    and w.status not in ('canceled', 'off')
  order by u.id, w.starts_on desc
)
update public.game_film_uploads u
set event_name = m.event_name
from matches m
where u.id = m.id
  and u.event_name is null
  and char_length(m.event_name) between 1 and 80;
