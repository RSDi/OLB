-- 0172_game_stats.sql
--
-- Stats (/portal/stats): player stats read from photos of the scorebook.
--
-- A coach photographs our page of the book after a game. Claude reads it:
-- each player's scoring marks by quarter (2 and 3 are baskets, 1 a made free
-- throw, 0 a missed one), the R marks (rebounds), fouls, and what the book
-- itself wrote down (quarter scores, the TP and FTM/FTA columns). The app
-- adds the marks up, checks them against the book, and the coach fixes what
-- doesn't match before saving.
--
--   stats_games   one game: our team, the date, which game of the day, the
--                 opponent (not on our page: the coach types it), both
--                 scores, overtime, and the book's quarter scores as written
--                 ({"q1":13,"half":28,"q3":34,"final":48}, running totals).
--                 status: draft (being checked) or saved.
--   stats_books   a photo of the book (private `scorebooks` bucket) and what
--                 was read from it (read, the model's answer as JSON).
--   stats_lines   one player in one game: the marks per quarter as written
--                 ("2 3 1 1"), rebounds, fouls, what the book's TP and
--                 FTM/FTA columns say, and the totals worked out from the
--                 marks (points, fg2, fg3, ftm, fta) so season pages can add
--                 them up without parsing. player_id links the Directory
--                 player, matched by jersey number; null until matched.
--
-- A game lines up with Film by team + date + opponent (game_film_uploads).
--
-- Who: can_edit_stats(), the board (is_staff()), coaches (is_coach(), 0108)
-- and Teams & volunteers (has_permission('teams')), read and write all of
-- it. Families don't see stats yet. The bucket has no storage policies: the
-- app signs uploads and links with the service role after its own check.
--
-- Apply via the Supabase SQL editor, after 0171. Idempotent.

begin;

create or replace function public.can_edit_stats()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_staff() or public.is_coach() or public.has_permission('teams')
$$;

revoke all on function public.can_edit_stats() from public, anon;
grant execute on function public.can_edit_stats() to authenticated, service_role;

-- ─── Games ──────────────────────────────────────────────────────────────────

create table if not exists public.stats_games (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid references public.olb_teams(id) on delete set null,
  game_date       date not null,
  game_no         smallint not null default 1 check (game_no between 1 and 9),
  opponent        text not null default '' check (length(opponent) <= 80),
  our_score       smallint check (our_score is null or our_score between 0 and 300),
  their_score     smallint check (their_score is null or their_score between 0 and 300),
  overtime        boolean not null default false,
  quarter_scores  jsonb not null default '{}'::jsonb,
  status          text not null default 'draft' check (status in ('draft', 'saved')),
  created_by      uuid references auth.users(id) on delete set null,
  saved_by        uuid references auth.users(id) on delete set null,
  saved_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists stats_games_team_idx on public.stats_games (team_id, game_date desc, game_no);

-- ─── Photos of the book ─────────────────────────────────────────────────────

create table if not exists public.stats_books (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.stats_games(id) on delete cascade,
  photo_path  text not null,
  status      text not null default 'uploading'
                check (status in ('uploading', 'reading', 'read', 'failed')),
  error       text,
  read        jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists stats_books_game_idx on public.stats_books (game_id);

-- ─── Player lines ───────────────────────────────────────────────────────────

create table if not exists public.stats_lines (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.stats_games(id) on delete cascade,
  player_id   uuid references public.olb_players(id) on delete set null,
  jersey      text not null default '' check (length(jersey) <= 4),
  book_name   text not null default '' check (length(book_name) <= 60),
  q1          text not null default '' check (length(q1) <= 80),
  q2          text not null default '' check (length(q2) <= 80),
  q3          text not null default '' check (length(q3) <= 80),
  q4          text not null default '' check (length(q4) <= 80),
  ot          text not null default '' check (length(ot) <= 80),
  rebounds    smallint not null default 0 check (rebounds between 0 and 99),
  fouls       smallint not null default 0 check (fouls between 0 and 9),
  played      boolean not null default true,
  tp_written  smallint,
  ft_written  text not null default '' check (length(ft_written) <= 12),
  points      smallint not null default 0,
  fg2         smallint not null default 0,
  fg3         smallint not null default 0,
  ftm         smallint not null default 0,
  fta         smallint not null default 0,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists stats_lines_game_idx on public.stats_lines (game_id, sort_order);
create index if not exists stats_lines_player_idx on public.stats_lines (player_id) where player_id is not null;

-- ─── Who ────────────────────────────────────────────────────────────────────

alter table public.stats_games enable row level security;
alter table public.stats_books enable row level security;
alter table public.stats_lines enable row level security;

drop policy if exists "stats_games_all" on public.stats_games;
create policy "stats_games_all" on public.stats_games
  for all to authenticated
  using ((select public.can_edit_stats()))
  with check ((select public.can_edit_stats()));

drop policy if exists "stats_books_all" on public.stats_books;
create policy "stats_books_all" on public.stats_books
  for all to authenticated
  using ((select public.can_edit_stats()))
  with check ((select public.can_edit_stats()));

drop policy if exists "stats_lines_all" on public.stats_lines;
create policy "stats_lines_all" on public.stats_lines
  for all to authenticated
  using ((select public.can_edit_stats()))
  with check ((select public.can_edit_stats()));

grant select, insert, update, delete on public.stats_games to authenticated, service_role;
grant select, insert, update, delete on public.stats_books to authenticated, service_role;
grant select, insert, update, delete on public.stats_lines to authenticated, service_role;

-- 15 MB a photo. Private: links are signed by the app.
insert into storage.buckets (id, name, public, file_size_limit)
values ('scorebooks', 'scorebooks', false, 15728640)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

commit;
