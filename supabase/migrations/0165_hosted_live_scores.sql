-- 0165_hosted_live_scores.sql
--
-- Live scores for a tournament we host (0150): a public page parents reach
-- from a QR code (/shootout), scores entered at each court's scorer's table
-- with a PIN, and pools that feed Saturday's placement games.
--
--   hs_hosted.live_public     the public page shows this tournament. Off
--                             until a planner turns it on.
--   hs_hosted.scorer_pin      six digits the tournament desk hands to the
--                             scorer's tables. Planners see it on the
--                             portal page (RLS from 0150); the public page
--                             never selects it. Changing it signs every
--                             scorer's phone out.
--   hs_hosted_teams.pool      which pool a team plays in within its division
--                             (HS Boys A: Pool 1 and Pool 2). Null: one pool.
--   hs_hosted_games.*_from    may also be 'P:<pool>:<place>': a seat filled
--                             from the pool standings once every game in that
--                             pool has a score ('P:1:1' = Pool 1, 1st).
--   hs_hosted_pin_failures    wrong PINs, by a hash of the address they came
--                             from, so one phone can't guess its way in.
--                             Only the server (service role) reads or writes
--                             it.
--
-- Apply via the Supabase SQL editor, after 0164. Idempotent.

begin;

alter table public.hs_hosted
  add column if not exists live_public boolean not null default false,
  add column if not exists scorer_pin text;

alter table public.hs_hosted drop constraint if exists hs_hosted_scorer_pin_check;
alter table public.hs_hosted
  add constraint hs_hosted_scorer_pin_check check (scorer_pin is null or scorer_pin ~ '^[0-9]{6}$');

alter table public.hs_hosted_teams
  add column if not exists pool smallint;

alter table public.hs_hosted_teams drop constraint if exists hs_hosted_teams_pool_check;
alter table public.hs_hosted_teams
  add constraint hs_hosted_teams_pool_check check (pool is null or pool between 1 and 8);

alter table public.hs_hosted_games drop constraint if exists hs_hosted_games_home_from_check;
alter table public.hs_hosted_games drop constraint if exists hs_hosted_games_away_from_check;
alter table public.hs_hosted_games
  add constraint hs_hosted_games_home_from_check
  check (home_from is null or home_from ~ '^([WL]:[0-9a-f-]{36}|P:[1-8]:[1-9])$');
alter table public.hs_hosted_games
  add constraint hs_hosted_games_away_from_check
  check (away_from is null or away_from ~ '^([WL]:[0-9a-f-]{36}|P:[1-8]:[1-9])$');

create table if not exists public.hs_hosted_pin_failures (
  id          uuid primary key default gen_random_uuid(),
  weekend_id  uuid not null references public.hs_hosted(weekend_id) on delete cascade,
  ip_hash     text not null check (length(ip_hash) between 8 and 128),
  at          timestamptz not null default now()
);

create index if not exists hs_hosted_pin_failures_lookup_idx
  on public.hs_hosted_pin_failures (weekend_id, ip_hash, at desc);

alter table public.hs_hosted_pin_failures enable row level security;
-- No policies: only the service role touches it.
grant select, insert, update, delete on public.hs_hosted_pin_failures to service_role;

commit;

notify pgrst, 'reload schema';
