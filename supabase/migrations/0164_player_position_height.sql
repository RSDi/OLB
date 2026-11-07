-- 0164_player_position_height.sql
--
-- A player's position and height, next to the grade column olb_players has
-- had since 0089. All three show in the signed-in Directory (the list, the
-- player's page and team pages) and are set from Edit player. The public
-- Directory (lib/teams/public-directory.ts) names its columns and doesn't
-- select any of them.
--
--   position       'Point guard', 'Shooting guard', 'Small forward',
--                  'Power forward' or 'Center' (checked in the app, so the
--                  list can change without a migration)
--   height_inches  total inches, 36 to 96; shown as 5′10″
--
-- No new table, sequence or function, so no Data API grants: the columns
-- ride on olb_players' existing grants and RLS.
--
-- Apply via the Supabase SQL editor, after 0163. Idempotent.

alter table public.olb_players
  add column if not exists position text,
  add column if not exists height_inches smallint;

alter table public.olb_players
  drop constraint if exists olb_players_height_inches_check;
alter table public.olb_players
  add constraint olb_players_height_inches_check
  check (height_inches is null or height_inches between 36 and 96);
