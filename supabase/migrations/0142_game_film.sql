-- 0142_game_film.sql
--
-- Game-film uploader: families drop videos on /t/<team>; coaches open Film
-- in the portal sidebar.
--
--   game_film_uploads     one row per file (team, uploader, filename, size,
--                         status holding/moved, timestamps).
--   game-film             private Storage bucket. Uploads go browser →
--                         Storage over TUS with a short-lived signed token
--                         minted by the service role; bytes never pass
--                         through Vercel.
--   film_view             permission: list and download.
--   film_manage           permission: mark moved and delete (includes view).
--
-- Super-admins hold every permission already. Nobody else gets these until
-- a super-admin grants them in Settings → Access Profiles or a person's
-- extras. The built-in Board profile is not changed.
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0141. Idempotent.

begin;

-- ─── Uploads log ────────────────────────────────────────────────────────────

create table if not exists public.game_film_uploads (
  id            uuid primary key default gen_random_uuid(),
  team          text not null,
  uploader_name text not null,
  filename      text not null,
  content_type  text,
  size_bytes    bigint,
  storage_path  text not null unique,
  status        text not null default 'holding'
                  check (status in ('holding', 'moved')),
  created_at    timestamptz not null default now(),
  moved_at      timestamptz
);

create index if not exists game_film_uploads_team_created_idx
  on public.game_film_uploads (team, created_at desc);
create index if not exists game_film_uploads_status_moved_idx
  on public.game_film_uploads (status, moved_at);

alter table public.game_film_uploads enable row level security;

revoke all on table public.game_film_uploads from public, anon;
grant select on table public.game_film_uploads to authenticated;

-- ─── Permission helpers ─────────────────────────────────────────────────────

create or replace function public.can_view_film()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.has_permission('film_view') or public.has_permission('film_manage')
$$;

create or replace function public.can_manage_film()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.has_permission('film_manage') $$;

revoke all on function public.can_view_film() from public, anon;
revoke all on function public.can_manage_film() from public, anon;
grant execute on function public.can_view_film() to authenticated, service_role;
grant execute on function public.can_manage_film() to authenticated, service_role;

drop policy if exists "game_film_uploads_select" on public.game_film_uploads;
create policy "game_film_uploads_select" on public.game_film_uploads
  for select to authenticated
  using ((select public.can_view_film()));

drop policy if exists "game_film_uploads_update" on public.game_film_uploads;
create policy "game_film_uploads_update" on public.game_film_uploads
  for update to authenticated
  using ((select public.can_manage_film()))
  with check ((select public.can_manage_film()));

drop policy if exists "game_film_uploads_delete" on public.game_film_uploads;
create policy "game_film_uploads_delete" on public.game_film_uploads
  for delete to authenticated
  using ((select public.can_manage_film()));

-- Parent uploads and the cron use the service role, which bypasses RLS.
-- No INSERT policy for authenticated/anon.

-- ─── Private bucket ─────────────────────────────────────────────────────────
-- No storage.objects policies: reads, writes and deletes go through the
-- service role after the app checks a team code or a film permission.
-- file_size_limit is 20 GiB. Also raise the project's global Storage limit
-- in the Supabase dashboard if it is still the default (often 50 MB).

insert into storage.buckets (id, name, public, file_size_limit)
values ('game-film', 'game-film', false, 21474836480)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

commit;
