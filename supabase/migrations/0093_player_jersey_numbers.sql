-- 0093_player_jersey_numbers.sql
--
-- Each player's jersey number, shown in the Directory, on team pages and on
-- the Team manager board, and edited from the board's player dialog. Text,
-- not int, so "0" and "00" stay distinct.
--
-- Apply via the Supabase SQL editor, after 0092. Idempotent.

alter table public.olb_players
  add column if not exists jersey_number text;
