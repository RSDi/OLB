-- Down for 0135_hs_hotel_stays.sql
-- Drops hotel stay tables and reactivates the season-wide Hotel registration
-- requirement from 0134 (if still present).

begin;

drop policy if exists "hs_hotel_stay_players_all" on public.hs_hotel_stay_players;
drop policy if exists "hs_hotel_stay_players_select" on public.hs_hotel_stay_players;
drop policy if exists "hs_hotel_stays_delete" on public.hs_hotel_stays;
drop policy if exists "hs_hotel_stays_update" on public.hs_hotel_stays;
drop policy if exists "hs_hotel_stays_insert" on public.hs_hotel_stays;
drop policy if exists "hs_hotel_stays_select" on public.hs_hotel_stays;

drop table if exists public.hs_hotel_stay_players;
drop table if exists public.hs_hotel_stays;

update public.olb_requirements
   set active = true
 where lower(name) = 'hotel registration'
   and deleted_at is null
   and active = false;

notify pgrst, 'reload schema';

commit;
