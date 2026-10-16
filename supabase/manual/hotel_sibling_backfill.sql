-- OLB hotel stays: copy sibling marks onto players who have no row on the
-- same stay. NOT a migration — run in the Supabase SQL editor (postgres),
-- which sees every player the way Jeff does.
--
-- Based on query (a) in the sibling-gap check: a current-season player with
-- no hs_hotel_stay_players row, whose sibling (shares a parent via
-- olb_player_parents) is Booked in block or Staying elsewhere on that stay.
-- Copies that sibling's status and note, with the note prefixed
-- 'Copied from sibling: '.
--
-- Wrapped in a transaction with a preview and before/after counts.
-- Ends in ROLLBACK by default. Jeff: change the last statement to COMMIT
-- when you are ready to apply.

begin;

create temporary table hotel_sibling_backfill_src as
with season as (
  select id from public.olb_boards order by season desc limit 1
), ps as (
  select p.id as player_id, p.full_name, p.team_id,
         s.id as stay_id, s.name as stay_name,
         coalesce(sp.status, 'missing') as state,
         sp.status, sp.completed_on, sp.note, sp.marked_by
  from public.olb_players p
  join season on season.id = p.board_id
  join public.hs_hotel_stays s
    on s.status <> 'canceled'
   and (s.team_ids is null or cardinality(s.team_ids) = 0 or p.team_id = any(s.team_ids))
  left join public.hs_hotel_stay_players sp
    on sp.stay_id = s.id and sp.player_id = p.id
)
select distinct on (m.player_id, m.stay_id)
       m.stay_id,
       m.player_id,
       m.full_name                          as not_yet_known_player,
       m.stay_name,
       sib.player_id                        as sibling_id,
       sib.full_name                        as sibling_name,
       sib.status                           as sibling_status,
       sib.completed_on                     as sibling_completed_on,
       sib.note                             as sibling_note,
       sib.marked_by                        as sibling_marked_by
from ps m
join public.olb_player_parents pp  on pp.player_id = m.player_id
join public.olb_player_parents pp2 on pp2.member_id = pp.member_id and pp2.player_id <> m.player_id
join ps sib on sib.player_id = pp2.player_id and sib.stay_id = m.stay_id and sib.state in ('done','waived')
where m.state = 'missing'
order by m.player_id, m.stay_id, sib.full_name;

-- Preview: players "Not yet known" whose sibling is covered on the same stay
-- (query a).
select stay_name,
       not_yet_known_player,
       sibling_name,
       case sibling_status when 'done' then 'Booked in block' else 'Staying elsewhere' end as sibling_state,
       sibling_note
  from hotel_sibling_backfill_src
 order by stay_name, not_yet_known_player;

select count(*) as rows_to_insert from hotel_sibling_backfill_src;

select count(*) as stay_player_rows_before from public.hs_hotel_stay_players;

insert into public.hs_hotel_stay_players (
  stay_id, player_id, status, completed_on, note, marked_by
)
select s.stay_id,
       s.player_id,
       s.sibling_status,
       s.sibling_completed_on,
       'Copied from sibling: ' || coalesce(s.sibling_note, ''),
       s.sibling_marked_by
  from hotel_sibling_backfill_src s
  left join public.hs_hotel_stay_players already
    on already.stay_id = s.stay_id and already.player_id = s.player_id
 where already.player_id is null;

select count(*) as stay_player_rows_after from public.hs_hotel_stay_players;

select count(*) as remaining_sibling_gaps
  from hotel_sibling_backfill_src s
  left join public.hs_hotel_stay_players now
    on now.stay_id = s.stay_id and now.player_id = s.player_id
 where now.player_id is null;

-- Jeff: change ROLLBACK to COMMIT when you are ready to apply.
rollback;
