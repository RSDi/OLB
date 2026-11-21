-- 0182_film_game_parts.sql
--
-- A game can have more than one video: a half, a quarter, overtime. Each
-- upload says which part it is, and the team film page shows one game with
-- its parts in order.
--
--   game_film_uploads.part   null = the whole game (or not said). Otherwise
--                            h1, h2 (halves), q1–q4 (quarters), ot, ot2, ot3.
--                            Labels and order live in lib/film/parts.ts.
--
-- Adds a column to an existing table, so no new Data API grants. Idempotent.

alter table public.game_film_uploads
  add column if not exists part text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'game_film_uploads_part_check'
  ) then
    alter table public.game_film_uploads
      add constraint game_film_uploads_part_check
      check (part is null or part in ('h1', 'h2', 'q1', 'q2', 'q3', 'q4', 'ot', 'ot2', 'ot3'));
  end if;
end $$;
