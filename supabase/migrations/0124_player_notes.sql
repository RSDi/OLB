-- 0124_player_notes.sql
--
-- Notes on a player, for the board and anyone with the Registrations
-- permission: a running log of what happened ("called twice, no answer"),
-- each note with optional attachments (screenshots of a text exchange, a
-- PDF). Families never see them.
--
--   olb_player_notes      one row per note. A note follows the player onto
--                         and off the waitlist: player_id while they're on
--                         the roster, registration_id while they're a
--                         registration. Moving a player to the waitlist sets
--                         registration_id before the player row goes (then
--                         player_id clears); approving them again sets the
--                         new player_id. Deleting is soft (deleted_at).
--   attachments           jsonb list of {path, name, type, size} in the
--                         private player-note-files bucket, under
--                         <note id>/<file>.
--   can_player_notes()    the board, or the Registrations permission.
--
-- Anyone who can read notes can add one; only the author (or a super-admin)
-- edits or deletes it.
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0123. Idempotent.

begin;

create or replace function public.can_player_notes()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() or public.can_manage_registrations() $$;

revoke all on function public.can_player_notes() from public, anon;
grant execute on function public.can_player_notes() to authenticated;

create table if not exists public.olb_player_notes (
  id              uuid primary key default gen_random_uuid(),
  board_id        uuid not null references public.olb_boards(id) on delete cascade,
  player_id       uuid references public.olb_players(id) on delete set null,
  registration_id uuid references public.olb_registrations(id) on delete set null,
  body            text not null default '' check (char_length(body) <= 10000),
  attachments     jsonb not null default '[]'::jsonb,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists olb_player_notes_player_idx       on public.olb_player_notes (player_id);
create index if not exists olb_player_notes_registration_idx on public.olb_player_notes (registration_id);

alter table public.olb_player_notes enable row level security;

drop policy if exists "olb_player_notes_select" on public.olb_player_notes;
create policy "olb_player_notes_select" on public.olb_player_notes
  for select to authenticated
  using ((select public.can_player_notes()));

drop policy if exists "olb_player_notes_insert" on public.olb_player_notes;
create policy "olb_player_notes_insert" on public.olb_player_notes
  for insert to authenticated
  with check ((select public.can_player_notes()) and created_by = (select auth.uid()));

drop policy if exists "olb_player_notes_update" on public.olb_player_notes;
create policy "olb_player_notes_update" on public.olb_player_notes
  for update to authenticated
  using ((select public.can_player_notes()) and (created_by = (select auth.uid()) or (select public.is_super_admin())))
  with check ((select public.can_player_notes()));

-- Attachments. Private: opened through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-note-files',
  'player-note-files',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "player_note_files_select" on storage.objects;
create policy "player_note_files_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'player-note-files' and (select public.can_player_notes()));

drop policy if exists "player_note_files_insert" on storage.objects;
create policy "player_note_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-note-files' and (select public.can_player_notes()));

-- No delete policy: files are removed by the server (a draft that was
-- cancelled, a note that was deleted), after it checks whose they are.
drop policy if exists "player_note_files_delete" on storage.objects;

commit;
