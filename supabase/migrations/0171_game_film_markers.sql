-- 0171_game_film_markers.sql
--
-- Named jump-to points on a game video ("Q2 start", "#12 steal"). The Film
-- page reads and writes them through the admin client after its own Game
-- film permission check, like game_film_uploads, so only service_role gets
-- Data API access. Rows go away with their upload.

create table if not exists public.game_film_markers (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid not null references public.game_film_uploads(id) on delete cascade,
  at_seconds  numeric(10, 2) not null check (at_seconds >= 0),
  label       text not null check (char_length(btrim(label)) between 1 and 80),
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists game_film_markers_upload_idx
  on public.game_film_markers (upload_id, at_seconds);

alter table public.game_film_markers enable row level security;

revoke all on table public.game_film_markers from public, anon, authenticated;
grant select, insert, update, delete on public.game_film_markers to service_role;
