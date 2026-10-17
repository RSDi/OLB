-- 0143_game_film_game.sql
--
-- Guest film upload (/t/<slug>) records the game with each file: calendar
-- date (America/Chicago day, default today), opponent, and optional score.
-- Coaches see the same fields on Film.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0142. Idempotent.

begin;

alter table public.game_film_uploads
  add column if not exists game_date date,
  add column if not exists opponent text,
  add column if not exists our_score integer,
  add column if not exists their_score integer;

create index if not exists game_film_uploads_game_date_idx
  on public.game_film_uploads (game_date desc nulls last);

commit;
