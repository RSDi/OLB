-- 0142_game_film.sql
--
-- Game-film uploader: families drop videos on /t/<slug>; coaches open Film
-- in the portal sidebar. Team upload codes live on olb_teams (the Directory
-- teams), not in env vars.
--
--   game_film_uploads     one row per file (team slug + team_id, uploader,
--                         filename, size, status holding/moved, timestamps).
--   game_film_managers    portal users who may list/download that team's
--                         film without the global film_view grant.
--   olb_teams             film_slug, film_enabled, film_code_hash,
--                         film_code_version (hashed code; version invalidates
--                         unlock cookies on rotate).
--   game-film             private Storage bucket. Uploads go browser →
--                         Storage over TUS with a short-lived signed token
--                         minted by the service role; bytes never pass
--                         through Vercel.
--   film_view             permission: list and download every team.
--   film_manage           permission: Settings → Film, mark moved, delete
--                         (includes view). Super-admins hold both already.
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
  team_id       uuid references public.olb_teams(id) on delete set null,
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

alter table public.game_film_uploads
  add column if not exists team_id uuid references public.olb_teams(id) on delete set null;

create index if not exists game_film_uploads_team_created_idx
  on public.game_film_uploads (team, created_at desc);
create index if not exists game_film_uploads_status_moved_idx
  on public.game_film_uploads (status, moved_at);
create index if not exists game_film_uploads_team_id_idx
  on public.game_film_uploads (team_id);

alter table public.game_film_uploads enable row level security;

revoke all on table public.game_film_uploads from public, anon;
grant select on table public.game_film_uploads to authenticated;

-- ─── Codes on existing Directory teams ──────────────────────────────────────

alter table public.olb_teams
  add column if not exists film_slug text,
  add column if not exists film_enabled boolean not null default false,
  add column if not exists film_code_hash text,
  add column if not exists film_code_version integer not null default 1;

create unique index if not exists olb_teams_film_slug_uidx
  on public.olb_teams (film_slug)
  where film_slug is not null;

-- ─── Per-team video managers ────────────────────────────────────────────────

create table if not exists public.game_film_managers (
  team_id    uuid not null references public.olb_teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists game_film_managers_user_idx
  on public.game_film_managers (user_id);

alter table public.game_film_managers enable row level security;

revoke all on table public.game_film_managers from public, anon;
grant select, insert, delete on table public.game_film_managers to authenticated;

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
  using (
    (select public.can_view_film())
    or exists (
      select 1 from public.game_film_managers m
      where m.team_id = game_film_uploads.team_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "game_film_uploads_update" on public.game_film_uploads;
create policy "game_film_uploads_update" on public.game_film_uploads
  for update to authenticated
  using ((select public.can_manage_film()))
  with check ((select public.can_manage_film()));

drop policy if exists "game_film_uploads_delete" on public.game_film_uploads;
create policy "game_film_uploads_delete" on public.game_film_uploads
  for delete to authenticated
  using ((select public.can_manage_film()));

drop policy if exists "game_film_managers_select" on public.game_film_managers;
create policy "game_film_managers_select" on public.game_film_managers
  for select to authenticated
  using (
    (select public.can_manage_film())
    or user_id = (select auth.uid())
  );

drop policy if exists "game_film_managers_insert" on public.game_film_managers;
create policy "game_film_managers_insert" on public.game_film_managers
  for insert to authenticated
  with check ((select public.can_manage_film()));

drop policy if exists "game_film_managers_delete" on public.game_film_managers;
create policy "game_film_managers_delete" on public.game_film_managers
  for delete to authenticated
  using ((select public.can_manage_film()));

-- Parent uploads and the cron use the service role, which bypasses RLS.
-- No INSERT policy for authenticated/anon.
-- Film code hashes are never selected by authenticated clients from this
-- migration: Settings reads them through the service role after film_manage.

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
