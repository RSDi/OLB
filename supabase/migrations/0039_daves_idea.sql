-- 0039_daves_idea.sql
--
-- Dave's Idea: one-tap audio capture → transcription → action items.
--
-- Personal recordings per user. Each row tracks an audio file living in
-- Vercel Blob, its AssemblyAI transcript, and (later) LLM-extracted action
-- items.
--
-- Visibility: owner-only. Staff gating happens at the route layer
-- (/portal/daves-idea redirects non-staff). RLS enforces user_id = auth.uid()
-- so even if a non-staff user hit a leaked recording id, they'd see nothing.
--
-- The AssemblyAI webhook + Vercel Workflow functions bypass RLS via the
-- service-role key, which is the standard pattern for backend pipeline jobs.
--
-- Depends on 0001 (set_updated_at).

begin;

-- ---------------------------------------------------------------------------
-- 1. daves_idea_recordings — one row per captured audio file.
--
-- Lifecycle (status):
--   uploading      audio still being POSTed from the client
--   transcribing   handed off to AssemblyAI, awaiting webhook
--   extracting     transcript in hand, calling Claude for title + action items
--   ready          fully processed, visible in the inbox
--   failed         any step errored out; `error` holds the human-readable msg
-- ---------------------------------------------------------------------------

create table if not exists public.daves_idea_recordings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- LLM-generated short title. Null until extraction completes.
  title           text,

  -- Vercel Blob URL of the source audio. Private blob, owner-only download.
  audio_blob_url  text not null,
  duration_sec    int  not null default 0,

  -- 'pwa' for browser MediaRecorder uploads, 'native' for the future iOS app.
  source          text not null default 'pwa'
                  check (source in ('pwa', 'native', 'watch')),

  status          text not null default 'uploading'
                  check (status in ('uploading', 'transcribing', 'extracting', 'ready', 'failed')),

  -- AssemblyAI's transcript id. We persist it so the webhook can correlate
  -- the callback back to our row even if Vercel cold-starts a fresh function.
  assemblyai_id   text unique,

  -- Full plain-text transcript.
  transcript      text,

  -- Speaker-labeled utterances from AssemblyAI: an array of
  -- { speaker, text, start, end }. Stored as jsonb so we can render
  -- speaker chips in the UI without re-parsing.
  utterances      jsonb,

  error           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists daves_idea_recordings_user_idx
  on public.daves_idea_recordings (user_id, created_at desc)
  where deleted_at is null;

create index if not exists daves_idea_recordings_assemblyai_idx
  on public.daves_idea_recordings (assemblyai_id)
  where assemblyai_id is not null;

drop trigger if exists daves_idea_recordings_set_updated_at on public.daves_idea_recordings;
create trigger daves_idea_recordings_set_updated_at
  before update on public.daves_idea_recordings
  for each row execute function public.set_updated_at();

alter table public.daves_idea_recordings enable row level security;

create policy "daves_idea_recordings_select_own" on public.daves_idea_recordings
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

create policy "daves_idea_recordings_insert_own" on public.daves_idea_recordings
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "daves_idea_recordings_update_own" on public.daves_idea_recordings
  for update to authenticated
  using (user_id = auth.uid() and deleted_at is null)
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. daves_idea_action_items — LLM-extracted action items per recording.
--
-- Routed_to is a free-text label for now (e.g. 'HubSpot Task',
-- 'Email follow-up'). Once we wire real integrations it'll graduate to a
-- typed enum with side effects.
-- ---------------------------------------------------------------------------

create table if not exists public.daves_idea_action_items (
  id            uuid primary key default gen_random_uuid(),
  recording_id  uuid not null references public.daves_idea_recordings(id) on delete cascade,
  text          text not null,
  routed_to     text,
  done          boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists daves_idea_action_items_recording_idx
  on public.daves_idea_action_items (recording_id, sort_order);

drop trigger if exists daves_idea_action_items_set_updated_at on public.daves_idea_action_items;
create trigger daves_idea_action_items_set_updated_at
  before update on public.daves_idea_action_items
  for each row execute function public.set_updated_at();

alter table public.daves_idea_action_items enable row level security;

-- Action items inherit visibility from their parent recording. We can't
-- self-reference auth.uid() directly since the user_id lives on the parent,
-- so the policy joins through daves_idea_recordings.
create policy "daves_idea_action_items_select_own" on public.daves_idea_action_items
  for select to authenticated
  using (
    exists (
      select 1 from public.daves_idea_recordings r
      where r.id = recording_id
        and r.user_id = auth.uid()
        and r.deleted_at is null
    )
  );

create policy "daves_idea_action_items_insert_own" on public.daves_idea_action_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.daves_idea_recordings r
      where r.id = recording_id
        and r.user_id = auth.uid()
        and r.deleted_at is null
    )
  );

create policy "daves_idea_action_items_update_own" on public.daves_idea_action_items
  for update to authenticated
  using (
    exists (
      select 1 from public.daves_idea_recordings r
      where r.id = recording_id
        and r.user_id = auth.uid()
        and r.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.daves_idea_recordings r
      where r.id = recording_id
        and r.user_id = auth.uid()
        and r.deleted_at is null
    )
  );

create policy "daves_idea_action_items_delete_own" on public.daves_idea_action_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.daves_idea_recordings r
      where r.id = recording_id
        and r.user_id = auth.uid()
        and r.deleted_at is null
    )
  );

commit;
