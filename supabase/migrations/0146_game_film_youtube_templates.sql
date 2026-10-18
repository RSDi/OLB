-- 0146_game_film_youtube_templates.sql
--
-- Per-team YouTube title/description templates, optional extras (off by
-- default), a Slack channel id for Sparky, and approval-gated Slack drafts
-- after a film video lands on YouTube. Scores already live on
-- game_film_uploads (0143); this migration does not touch them.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0145. Idempotent.

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
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists game_film_slack_drafts_status_idx
  on public.game_film_slack_drafts (status, created_at desc)
  where status in ('pending', 'posting');

create index if not exists game_film_slack_drafts_team_idx
  on public.game_film_slack_drafts (team_id);

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
  );

-- Writes go through the service role after a film_manage check. Nothing
-- posts to Slack from a trigger or cron.

commit;
