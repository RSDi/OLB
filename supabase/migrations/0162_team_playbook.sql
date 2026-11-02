-- 0162_team_playbook.sql
--
-- Team Playbook (/portal/team-playbook): plays the coaches teach, drawn as an
-- animated half court with step-by-step captions.
--
-- A coach uploads a video of a play (a whiteboard talk-through, a walk-through
-- on the court). The video goes to the private `team-playbook` bucket, along
-- with a handful of still frames the browser takes from it. AssemblyAI writes
-- down what the coach says (word timings, so the captions follow their
-- voice), then Claude reads the frames and the transcript and draws the play
-- (`diagram`, the shape in lib/playbook/diagram.ts). The play stays a draft,
-- seen only by the people who can edit the playbook, until one of them checks
-- it against the video and shares it.
--
-- status: uploading → transcribing → reading → draft → shared, or failed
-- (error says why). A play typed in by hand starts as a draft.
--
-- Who sees what:
--   * shared plays: every approved member (families included: the plays are
--     for the players).
--   * drafts and plays still being read: can_edit_playbook().
-- can_edit_playbook(): the board (is_staff()), coaches (is_coach(), 0108),
-- and anyone with the Teams & volunteers permission (has_permission('teams')).
--
-- The bucket has no storage policies: the app signs every upload and every
-- playback link with the service role after its own permission check.
--
-- Apply via the Supabase SQL editor, after 0161. Idempotent.

begin;

create or replace function public.can_edit_playbook()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_staff() or public.is_coach() or public.has_permission('teams')
$$;

revoke all on function public.can_edit_playbook() from public, anon;
grant execute on function public.can_edit_playbook() to authenticated, service_role;

create table if not exists public.team_plays (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default '',
  call_name      text not null default '',              -- what the coach yells: "Horns", "Box"
  category       text not null default '',              -- "Half-court offense", "Inbounds", …
  team_ids       uuid[] not null default '{}',          -- olb_teams this play is for; empty = every team
  coach_name     text not null default '',              -- who drew it, as shown on the play
  status         text not null default 'draft'
                   check (status in ('uploading', 'transcribing', 'reading', 'draft', 'shared', 'failed')),
  error          text,
  diagram        jsonb,                                 -- lib/playbook/diagram.ts
  video_path     text,                                  -- object in the team-playbook bucket
  video_name     text not null default '',              -- the file name as uploaded
  video_link     text not null default '',              -- e.g. the Slack post the video came from
  frame_paths    jsonb not null default '[]'::jsonb,    -- [{ path, sec }]: stills the browser took
  duration_sec   numeric,
  assemblyai_id  text,
  transcript     jsonb,                                 -- [{ text, start, end }] in seconds
  sort_order     int not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  shared_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists team_plays_status_idx on public.team_plays (status);
create index if not exists team_plays_assemblyai_idx on public.team_plays (assemblyai_id);

alter table public.team_plays enable row level security;

drop policy if exists "team_plays_select" on public.team_plays;
create policy "team_plays_select" on public.team_plays
  for select to authenticated
  using (
    (select public.is_approved())
    and (status = 'shared' or (select public.can_edit_playbook()))
  );

drop policy if exists "team_plays_insert" on public.team_plays;
create policy "team_plays_insert" on public.team_plays
  for insert to authenticated
  with check ((select public.can_edit_playbook()));

drop policy if exists "team_plays_update" on public.team_plays;
create policy "team_plays_update" on public.team_plays
  for update to authenticated
  using ((select public.can_edit_playbook()))
  with check ((select public.can_edit_playbook()));

drop policy if exists "team_plays_delete" on public.team_plays;
create policy "team_plays_delete" on public.team_plays
  for delete to authenticated
  using ((select public.can_edit_playbook()));

grant select, insert, update, delete on public.team_plays to authenticated, service_role;

-- 2 GiB: a few minutes of phone video. Private: links are signed by the app.
insert into storage.buckets (id, name, public, file_size_limit)
values ('team-playbook', 'team-playbook', false, 2147483648)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

commit;
