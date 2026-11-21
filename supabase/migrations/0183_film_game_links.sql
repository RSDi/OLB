-- 0183_film_game_links.sql
--
-- "Part of the game" becomes a free note, and a game can carry links.
--
--   game_film_uploads.part   was a code from a fixed list (0182: h1, h2,
--                            q1–q4, ot…). Now free text up to 60 characters
--                            ("2nd half", "Bench angle"). Existing codes
--                            become their words. lib/film/parts.ts still
--                            sorts the usual words in play order.
--   game_film_links          links on a game: a YouTube video, a stream,
--                            Hudl, a stats sheet. Each has a note saying what
--                            it is, and a position for the order on the team
--                            film page. Hangs off one upload (the game's
--                            video it was added on) and goes with it.
--
-- The Film page and the team film page read and write links through the
-- admin client after their own checks, like game_film_markers, so only
-- service_role gets Data API access. Idempotent.

begin;

-- ─── Free-text note on a video ───────────────────────────────────────────────

alter table public.game_film_uploads drop constraint if exists game_film_uploads_part_check;

update public.game_film_uploads
   set part = case part
                when 'h1'  then '1st half'
                when 'h2'  then '2nd half'
                when 'q1'  then '1st quarter'
                when 'q2'  then '2nd quarter'
                when 'q3'  then '3rd quarter'
                when 'q4'  then '4th quarter'
                when 'ot'  then 'Overtime'
                when 'ot2' then '2nd overtime'
                when 'ot3' then '3rd overtime'
              end
 where part in ('h1', 'h2', 'q1', 'q2', 'q3', 'q4', 'ot', 'ot2', 'ot3');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'game_film_uploads_part_len'
  ) then
    alter table public.game_film_uploads
      add constraint game_film_uploads_part_len
      check (part is null or char_length(part) between 1 and 60);
  end if;
end $$;

-- ─── Links on a game ─────────────────────────────────────────────────────────

create table if not exists public.game_film_links (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid not null references public.game_film_uploads(id) on delete cascade,
  url         text not null check (url ~ '^https?://' and char_length(url) <= 500),
  note        text not null default '' check (char_length(note) <= 80),
  position    integer not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists game_film_links_upload_idx
  on public.game_film_links (upload_id, position);

alter table public.game_film_links enable row level security;

revoke all on table public.game_film_links from public, anon, authenticated;
grant select, insert, update, delete on public.game_film_links to service_role;

commit;
