-- 0148_game_film_youtube_templates.sql
--
-- Per-team YouTube title/description templates, optional extras (off by
-- default), a Slack channel id for Sparky, and approval-gated Slack drafts
-- after a film video lands on YouTube. Scores already live on
-- game_film_uploads (0143); this migration does not touch them.
--
-- Discarded Slack drafts are soft-deleted (status + discarded_at) and
-- recoverable for 30 days, then purged by the film-cleanup cron.
-- Player names on a description prefer that game's lineup, then the
-- season roster.
--
-- Numbering: apply after 0147_game_film_youtube_privacy.sql (#207), which
-- applies after 0146_agent_keys.sql (#208). 0149 is reserved for the
-- email-archive PR. 0150 is already on main.
-- To remove: supabase/removal/0148_game_film_youtube_templates_down.sql.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0147. Idempotent.

begin;

alter table public.olb_teams
  add column if not exists film_youtube_title_template text,
  add column if not exists film_youtube_description_template text,
  add column if not exists film_include_stats_book boolean not null default false,
  add column if not exists film_include_players boolean not null default false,
  add column if not exists film_include_tournament boolean not null default false,
  add column if not exists film_include_playlist_link boolean not null default false,
  add column if not exists film_slack_channel_id text;

update public.olb_teams
set
  film_youtube_title_template = coalesce(
    nullif(trim(film_youtube_title_template), ''),
    '{dot} {team} vs {opponent} – {date}'
  ),
  film_youtube_description_template = coalesce(
    nullif(trim(film_youtube_description_template), ''),
    E'{team} vs {opponent}, {date}\n{result_line}\nFinal: {our_score}–{their_score}\nWatch: {youtube_link}\nPlayers: {players}\nTournament: {tournament}\nStats: {stats_book}\nPlaylist: {playlist_link}\nGo Lightning! ⚡'
  )
where
  film_youtube_title_template is null
  or film_youtube_description_template is null;

create table if not exists public.game_film_slack_drafts (
  id                 uuid primary key default gen_random_uuid(),
  upload_id          uuid not null unique references public.game_film_uploads (id) on delete cascade,
  team_id            uuid references public.olb_teams (id) on delete set null,
  channel_id         text,
  body               text not null,
  status             text not null default 'pending'
                       check (status in ('pending', 'posting', 'posted', 'discarded')),
  slack_ts           text,
  posted_channel_id  text,
  posted_at          timestamptz,
  posted_by          uuid references auth.users (id) on delete set null,
  discarded_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.game_film_slack_drafts
  add column if not exists discarded_at timestamptz;

create index if not exists game_film_slack_drafts_status_idx
  on public.game_film_slack_drafts (status, created_at desc)
  where status in ('pending', 'posting');

create index if not exists game_film_slack_drafts_team_idx
  on public.game_film_slack_drafts (team_id);

create index if not exists game_film_slack_drafts_discarded_idx
  on public.game_film_slack_drafts (discarded_at)
  where status = 'discarded';

alter table public.game_film_slack_drafts enable row level security;

revoke all on table public.game_film_slack_drafts from public, anon;
grant select on table public.game_film_slack_drafts to authenticated;

drop policy if exists "game_film_slack_drafts_select" on public.game_film_slack_drafts;
create policy "game_film_slack_drafts_select" on public.game_film_slack_drafts
  for select to authenticated
  using (
    (select public.can_view_film())
    or exists (
      select 1 from public.game_film_managers m
      where m.team_id = game_film_slack_drafts.team_id
        and m.user_id = (select auth.uid())
    )
    or (select public.can_manage_teams())
  );

create table if not exists public.game_film_lineups (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.olb_teams (id) on delete cascade,
  game_date   date not null,
  opponent    text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (team_id, game_date, opponent)
);

create table if not exists public.game_film_lineup_players (
  lineup_id   uuid not null references public.game_film_lineups (id) on delete cascade,
  player_id   uuid not null references public.olb_players (id) on delete cascade,
  sort_order  integer not null default 0,
  primary key (lineup_id, player_id)
);

create index if not exists game_film_lineups_team_date_idx
  on public.game_film_lineups (team_id, game_date);

alter table public.game_film_lineups enable row level security;
alter table public.game_film_lineup_players enable row level security;

revoke all on table public.game_film_lineups from public, anon;
revoke all on table public.game_film_lineup_players from public, anon;
grant select on table public.game_film_lineups to authenticated;
grant select on table public.game_film_lineup_players to authenticated;

drop policy if exists "game_film_lineups_select" on public.game_film_lineups;
create policy "game_film_lineups_select" on public.game_film_lineups
  for select to authenticated
  using (
    (select public.can_view_film())
    or exists (
      select 1 from public.game_film_managers m
      where m.team_id = game_film_lineups.team_id
        and m.user_id = (select auth.uid())
    )
    or (select public.can_manage_teams())
  );

drop policy if exists "game_film_lineup_players_select" on public.game_film_lineup_players;
create policy "game_film_lineup_players_select" on public.game_film_lineup_players
  for select to authenticated
  using (
    (select public.can_view_film())
    or (select public.can_manage_teams())
    or exists (
      select 1
      from public.game_film_lineups l
      join public.game_film_managers m on m.team_id = l.team_id
      where l.id = game_film_lineup_players.lineup_id
        and m.user_id = (select auth.uid())
    )
  );

-- Writes go through the service role after a Teams & volunteers or
-- Game film (manage) check. Nothing posts to Slack from a trigger or cron.

commit;
