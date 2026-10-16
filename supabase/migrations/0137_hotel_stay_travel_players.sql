-- 0137_hotel_stay_travel_players.sql
--
-- Travel needs every current-season player for hotel-stay tracking (the
-- Directory tracker, the Booked / Not yet known counts, and the sibling
-- picker), including families who said no to the Directory. 0090's
-- olb_players_directory_select still hides opted-out players from everyone
-- else. This does not grant see_all_players (0123) — Travel does not get
-- fees, waivers or other board-only Directory fields from that power.
--
--   can_see_hotel_stay_players()   Travel grant (can_manage_travel)
--   hotel_stay_season_board_id()   latest olb_boards.season
--   hotel_stay_season_players()    current-season players + parent ids, for
--                                  the sibling picker (security definer so
--                                  Travel can read opted-out siblings)
--   olb_players_travel_hotel_select
--                                  SELECT on current-season olb_players for
--                                  Travel, so the tracker list and counts
--                                  include every player. Parent links follow
--                                  player visibility (0090, 0091).
--
-- Helper calls in policies are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0136. Idempotent.

begin;

create or replace function public.can_see_hotel_stay_players()
returns boolean language sql stable security definer set search_path = public
as $$ select public.can_manage_travel() $$;

create or replace function public.hotel_stay_season_board_id()
returns uuid language sql stable security definer set search_path = public
as $$ select id from public.olb_boards order by season desc limit 1 $$;

-- Current-season players Travel can mark on a stay, with the parent ids the
-- sibling picker uses (share a parent). Empty when the caller isn't Travel.
create or replace function public.hotel_stay_season_players()
returns table (
  id uuid,
  board_id uuid,
  team_id uuid,
  full_name text,
  parent_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.board_id,
    p.team_id,
    p.full_name,
    coalesce(
      (select array_agg(pp.member_id order by pp.member_id)
         from public.olb_player_parents pp
        where pp.player_id = p.id),
      '{}'::uuid[]
    ) as parent_ids
    from public.olb_players p
   where public.can_manage_travel()
     and p.board_id = public.hotel_stay_season_board_id()
$$;

revoke all on function public.can_see_hotel_stay_players() from public, anon;
revoke all on function public.hotel_stay_season_board_id() from public, anon;
revoke all on function public.hotel_stay_season_players() from public, anon;
grant execute on function public.can_see_hotel_stay_players() to authenticated, service_role;
grant execute on function public.hotel_stay_season_board_id() to authenticated, service_role;
grant execute on function public.hotel_stay_season_players() to authenticated, service_role;

-- Travel reads current-season players only. Other seasons and the general
-- directory_optin rule (0090) stay as they are.
drop policy if exists "olb_players_travel_hotel_select" on public.olb_players;
create policy "olb_players_travel_hotel_select" on public.olb_players
  for select to authenticated
  using (
    (select public.can_see_hotel_stay_players())
    and board_id = (select public.hotel_stay_season_board_id())
  );

notify pgrst, 'reload schema';

commit;
