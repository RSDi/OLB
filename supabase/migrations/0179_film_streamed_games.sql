-- 0179_film_streamed_games.sql
--
-- Streamed games: a game livestreamed on YouTube goes on Film (and the team
-- film page) right away, marked Streamed, and the full recording replaces it
-- when someone uploads it.
--
--   game_film_uploads.streamed            the row is a livestream link, not
--                                         an uploaded file. youtube_video_id
--                                         is the stream; there is no file.
--   game_film_uploads.replaces_stream_id  on a recording: the streamed game it
--                                         replaces. Once the recording is on
--                                         YouTube, the team film page shows it
--                                         in the stream's place. One recording
--                                         per stream.
--
-- Adds columns to an existing table, so no new Data API grants. Idempotent.

alter table public.game_film_uploads
  add column if not exists streamed boolean not null default false,
  add column if not exists replaces_stream_id uuid
    references public.game_film_uploads(id) on delete set null;

create unique index if not exists game_film_uploads_replaces_stream_uidx
  on public.game_film_uploads (replaces_stream_id)
  where replaces_stream_id is not null;
