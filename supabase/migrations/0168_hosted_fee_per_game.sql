-- Hosted tournaments price by the game, not by the team. The plan keeps a fee
-- per game and how many games a team gets; a team can have its own game count
-- (a team that plays one more bracket game, or leaves early).
--
-- What a visiting team pays: its own fee_cents when set (a flat override),
-- else game_fee_cents × (its games, else the plan's games_per_team).
--
-- team_fee_cents is no longer read or written. It stays for now so a rollback
-- of the app still finds it.

alter table public.hs_hosted
  add column if not exists game_fee_cents int check (game_fee_cents is null or game_fee_cents between 0 and 10000000),
  add column if not exists games_per_team int not null default 3 check (games_per_team between 1 and 20);

alter table public.hs_hosted_teams
  add column if not exists games int check (games is null or games between 0 and 20);

-- Carry each plan's team fee over without changing anyone's total: a fee that
-- splits evenly into three games ($315 → $105 × 3) becomes that; any other
-- fee becomes one game at the old team fee.
update public.hs_hosted
set game_fee_cents = case when team_fee_cents % 3 = 0 then team_fee_cents / 3 else team_fee_cents end,
    games_per_team = case when team_fee_cents % 3 = 0 then 3 else 1 end
where team_fee_cents is not null and game_fee_cents is null;
