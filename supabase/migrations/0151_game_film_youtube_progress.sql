-- 0151_game_film_youtube_progress.sql
--
-- Live YouTube-upload progress and a per-film event history. The inbox and
-- the board Film status page read these so "Uploading to YouTube" is not a
-- dead label: percent, bytes, ETA, started time, and each milestone / retry
-- / error. Stalled is computed (no new youtube_status value): no byte
-- movement for 30 minutes.
--
-- Additive only. game_film_youtube_jobs stays service-role-only so coaches
-- cannot read the resumable session URI. Events have no URI.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0150. Idempotent.

begin;

alter table public.game_film_youtube_jobs
  add column if not exists started_at timestamptz,
  add column if not exists last_progress_at timestamptz,
  add column if not exists bytes_total bigint;

create table if not exists public.game_film_youtube_events (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid not null references public.game_film_uploads (id) on delete cascade,
  at          timestamptz not null default now(),
  kind        text not null
                check (kind in (
                  'received',
                  'upload_started',
                  'progress',
                  'finished',
                  'playlist_added',
                  'retry',
                  'error',
                  'stalled'
                )),
  message     text not null,
  detail      text,
  bytes_sent  bigint,
  bytes_total bigint
);

create index if not exists game_film_youtube_events_upload_at_idx
  on public.game_film_youtube_events (upload_id, at desc);

alter table public.game_film_youtube_events enable row level security;

revoke all on table public.game_film_youtube_events from public, anon, authenticated;

commit;
