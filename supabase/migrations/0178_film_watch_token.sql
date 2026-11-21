-- 0178_film_watch_token.sql
--
-- Team film page links carry a random key so they can't be guessed from the
-- team's upload address: /watch/<film_slug>-<film_watch_token>.
--
--   olb_teams.film_watch_token   12 lowercase hex characters. Every row gets
--                                its own (the default is volatile, so the
--                                add column fills each existing row
--                                separately). Settings → Film → "New link"
--                                replaces it, which retires the old link.
--
-- Links without the key (/watch/<film_slug>) stop working.
--
-- Adds a column to an existing table, so no new Data API grants. Idempotent.

alter table public.olb_teams
  add column if not exists film_watch_token text not null
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'olb_teams_film_watch_token_format'
  ) then
    alter table public.olb_teams
      add constraint olb_teams_film_watch_token_format
      check (film_watch_token ~ '^[0-9a-f]{12}$');
  end if;
end $$;
