-- 0170_film_original_deleted.sql
--
-- Film keeps the phone's original file until YouTube has the video and
-- reports it Ready, then deletes the original 30 days later. The row stays so
-- the inbox still lists the game and its YouTube link; file_deleted_at says
-- the original is gone. Replaces the manual Holding / Mark moved step.
-- Adds a column to an existing table, so no new Data API grants.

alter table public.game_film_uploads
  add column if not exists file_deleted_at timestamptz;

create index if not exists game_film_uploads_original_expiry_idx
  on public.game_film_uploads (youtube_updated_at)
  where youtube_status = 'done' and file_deleted_at is null;
