-- 0146_game_film_youtube_privacy.sql
--
-- Read-only YouTube privacy + processing, copied from videos.list
-- part=status onto each game_film_uploads row so Portal → Film can show
-- what the video actually is on the channel (public / unlisted / private,
-- and whether YouTube is still processing it) without opening Studio.
-- youtube_privacy and youtube_synced_at are the shared names for the
-- concurrent GET /api/agent/film work. youtube_processing is uploadStatus.
--
-- OLB does NOT write privacy or any other video field back to YouTube.
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0145. Idempotent.

begin;

alter table public.game_film_uploads
  add column if not exists youtube_privacy text
    check (youtube_privacy in ('public', 'unlisted', 'private')),
  add column if not exists youtube_processing text
    check (youtube_processing in ('uploaded', 'processed', 'failed', 'rejected', 'deleted', 'missing')),
  add column if not exists youtube_synced_at timestamptz;

create index if not exists game_film_uploads_youtube_synced_at_idx
  on public.game_film_uploads (youtube_synced_at)
  where youtube_video_id is not null;

commit;
