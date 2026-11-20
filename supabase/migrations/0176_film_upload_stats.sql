-- 0176_film_upload_stats.sql
--
-- What the parent's phone measured while it uploaded: how long it actively
-- uploaded, the average speed, and the video's resolution and length. The
-- Film page shows it on each card (e.g. "4K · uploaded in 61 min at 14 Mbps")
-- so a slow upload can be traced to the connection or to an oversized file.
-- Columns only on an existing table; no new grants needed.

alter table public.game_film_uploads
  add column if not exists upload_seconds   integer,
  add column if not exists upload_mbps      numeric(9, 2),
  add column if not exists video_width      integer,
  add column if not exists video_height     integer,
  add column if not exists video_duration_s integer;
