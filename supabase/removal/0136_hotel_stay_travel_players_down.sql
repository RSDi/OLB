-- Down for 0136_hotel_stay_travel_players.sql
-- Drops Travel's current-season hotel-stay player reads. The Directory
-- directory_optin rule (0090) is unchanged.

begin;

drop policy if exists "olb_players_travel_hotel_select" on public.olb_players;

drop function if exists public.hotel_stay_season_players();
drop function if exists public.hotel_stay_season_board_id();
drop function if exists public.can_see_hotel_stay_players();

notify pgrst, 'reload schema';

commit;
