-- 0144_game_film_youtube.sql
--
-- In-app film playback uses existing signed download URLs; no extra tables.
-- YouTube auto-push: one club connection (encrypted refresh token, never a
-- password) and per-file status on game_film_uploads. Resumable upload
-- session URIs live in game_film_youtube_jobs so coaches cannot read them
-- through the inbox select policy.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0143. Idempotent.

begin;

-- ─── Club YouTube connection (singleton) ────────────────────────────────────
-- refresh_token_enc is AES-GCM ciphertext. The key is FILM_YOUTUBE_TOKEN_KEY
-- in Vercel, never in this table. No grant to authenticated: the app uses
-- the service role after a film_manage check.

create table if not exists public.game_film_youtube (
  id                 boolean primary key default true check (id),
  refresh_token_enc  text,
  channel_id         text,
  channel_title      text,
  connected_at       timestamptz,
  connected_by       uuid references auth.users (id) on delete set null,
  privacy_status     text not null default 'unlisted'
                       check (privacy_status in ('unlisted', 'private', 'public')),
  made_for_kids      boolean not null default false,
  updated_at         timestamptz not null default now()
);

insert into public.game_film_youtube (id) values (true)
on conflict (id) do nothing;

alter table public.game_film_youtube enable row level security;

revoke all on table public.game_film_youtube from public, anon, authenticated;

-- ─── Display columns on each film row ───────────────────────────────────────

alter table public.game_film_uploads
  add column if not exists youtube_status text
    check (youtube_status in ('queued', 'uploading', 'done', 'failed')),
  add column if not exists youtube_video_id text,
  add column if not exists youtube_error text,
  add column if not exists youtube_updated_at timestamptz;

create index if not exists game_film_uploads_youtube_status_idx
  on public.game_film_uploads (youtube_status)
  where youtube_status in ('queued', 'uploading');

-- ─── Resumable-upload cursor (service role only) ────────────────────────────

create table if not exists public.game_film_youtube_jobs (
  upload_id   uuid primary key references public.game_film_uploads (id) on delete cascade,
  upload_uri  text,
  bytes_sent  bigint not null default 0,
  attempts    integer not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.game_film_youtube_jobs enable row level security;

revoke all on table public.game_film_youtube_jobs from public, anon, authenticated;

commit;
