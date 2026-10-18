-- 0145_game_film_youtube_playlists.sql
--
-- After a film video finishes on YouTube, add it to a team playlist
-- (playlistItems.insert). Per-team default on olb_teams; optional per-video
-- override and a separate playlist status on game_film_uploads so a playlist
-- failure never marks the YouTube upload failed.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0144. Idempotent.

begin;

alter table public.olb_teams
  add column if not exists youtube_playlist_id text;

alter table public.game_film_uploads
  add column if not exists youtube_playlist_id text,
  add column if not exists youtube_playlist_status text
    check (youtube_playlist_status in ('queued', 'done', 'failed')),
  add column if not exists youtube_playlist_error text,
  add column if not exists youtube_playlist_item_id text,
  add column if not exists youtube_playlist_updated_at timestamptz;

create index if not exists game_film_uploads_youtube_playlist_status_idx
  on public.game_film_uploads (youtube_playlist_status)
  where youtube_playlist_status = 'queued';

commit;
