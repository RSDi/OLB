-- 0150_hosted_tournaments_down.sql
--
-- Removes the hosted-tournament plans (0150). Kept outside
-- supabase/migrations so it never runs by accident. Run it in the Supabase
-- SQL editor only after the code is gone.
--
-- What stays: the HS Schedule's weekends and teams coming, and whatever
-- "Update the budget" put in Finances (budget lines and income rows tagged
-- with the tournament), which belong to Finances from then on.
--
-- Idempotent.

begin;

drop table if exists public.hs_hosted_messages;
drop table if exists public.hs_hosted_finance;
drop table if exists public.hs_hosted_money;
drop table if exists public.hs_hosted_games;
drop table if exists public.hs_hosted_teams;
drop table if exists public.hs_hosted_divisions;
drop table if exists public.hs_hosted_steps;
drop table if exists public.hs_hosted;

commit;

notify pgrst, 'reload schema';
