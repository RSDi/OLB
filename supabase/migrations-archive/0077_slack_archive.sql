-- 0077_slack_archive.sql
--
-- Slack Channel Archive: a siloed, super-admin-only feature that mirrors the
-- full history of admin-registered Slack channels into Supabase, starting
-- with #building-committee. Deliberately kept in its own tables (all
-- `slack_archive_*`) with no foreign keys FROM other tables INTO this
-- feature, so it can be dropped cleanly later without touching anything
-- else:
--
--   drop table if exists public.slack_archive_messages;
--   drop table if exists public.slack_archive_sync_state;
--   drop table if exists public.slack_archive_channels;
--   delete from storage.buckets where id = 'slack-archive-files';
--
-- slack_archive_channels — the registry. Any channel can be added by a
--   super admin (label + Slack channel ID, entered by hand — no Slack API
--   call needed just to register one). Deactivate via `active = false`
--   rather than deleting, so history for a removed channel stays browsable.
--
-- slack_archive_messages — one row per Slack message (top-level or thread
--   reply), keyed by (channel_id, ts). `raw` keeps the full Slack payload
--   for future-proofing. Written only by the cron's service-role client.
--
-- slack_archive_sync_state — one row per channel: the high-water mark
--   (`last_ts`) the sync resumes from. Checkpointed after every page, so a
--   run that hits its time budget partway through is safely resumable.
--
-- All three tables are super-admin-only via RLS (`public.is_super_admin()`,
-- from 0001). The messages/sync-state tables carry no insert/update
-- policies at all — only the admin client (service role, bypasses RLS)
-- writes them, same pattern as PM instances / shutdown tasks.
--
-- Depends on 0001 (is_super_admin, set_updated_at). Idempotent.

begin;

create table if not exists public.slack_archive_channels (
  id               uuid primary key default gen_random_uuid(),
  slack_channel_id text not null,
  label            text not null,
  active           boolean not null default true,
  added_by         uuid references public.members(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists slack_archive_channels_slack_id_key
  on public.slack_archive_channels (slack_channel_id);

drop trigger if exists slack_archive_channels_set_updated_at on public.slack_archive_channels;
create trigger slack_archive_channels_set_updated_at
  before update on public.slack_archive_channels
  for each row execute function public.set_updated_at();

create table if not exists public.slack_archive_messages (
  id                uuid primary key default gen_random_uuid(),
  channel_id        text not null,
  ts                text not null,
  thread_ts         text,
  author_slack_id   text,
  author_member_id  uuid references public.members(id),
  author_name       text,
  message_text      text not null default '',
  reactions         jsonb not null default '[]'::jsonb,
  files             jsonb not null default '[]'::jsonb,
  raw               jsonb not null,
  edited            boolean not null default false,
  posted_at         timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists slack_archive_messages_channel_ts_key
  on public.slack_archive_messages (channel_id, ts);
create index if not exists slack_archive_messages_channel_thread_idx
  on public.slack_archive_messages (channel_id, thread_ts)
  where thread_ts is not null;
create index if not exists slack_archive_messages_channel_posted_idx
  on public.slack_archive_messages (channel_id, posted_at);

drop trigger if exists slack_archive_messages_set_updated_at on public.slack_archive_messages;
create trigger slack_archive_messages_set_updated_at
  before update on public.slack_archive_messages
  for each row execute function public.set_updated_at();

create table if not exists public.slack_archive_sync_state (
  channel_id   text primary key,
  last_ts      text,
  last_run_at  timestamptz,
  last_status  text check (last_status in ('ok', 'error')),
  last_error   text,
  updated_at   timestamptz not null default now()
);

drop trigger if exists slack_archive_sync_state_set_updated_at on public.slack_archive_sync_state;
create trigger slack_archive_sync_state_set_updated_at
  before update on public.slack_archive_sync_state
  for each row execute function public.set_updated_at();

-- Private bucket for downloaded file attachments. No storage.objects
-- policies — like reel-notes-audio, writes go through the admin client and
-- reads only happen via short-lived signed URLs minted server-side.
insert into storage.buckets (id, name, public)
values ('slack-archive-files', 'slack-archive-files', false)
on conflict (id) do update set public = excluded.public;

alter table public.slack_archive_channels enable row level security;
alter table public.slack_archive_messages enable row level security;
alter table public.slack_archive_sync_state enable row level security;

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('slack_archive_channels', 'slack_archive_messages', 'slack_archive_sync_state')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Channels: super admins manage the registry directly (session client + RLS),
-- like other settings-style config tables.
create policy "slack_archive_channels_select_super" on public.slack_archive_channels
  for select to authenticated
  using (public.is_super_admin());
create policy "slack_archive_channels_insert_super" on public.slack_archive_channels
  for insert to authenticated
  with check (public.is_super_admin());
create policy "slack_archive_channels_update_super" on public.slack_archive_channels
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Messages + sync state: read-only for super admins in the UI; every write
-- comes from the cron's service-role client, which bypasses RLS entirely.
create policy "slack_archive_messages_select_super" on public.slack_archive_messages
  for select to authenticated
  using (public.is_super_admin());
create policy "slack_archive_sync_state_select_super" on public.slack_archive_sync_state
  for select to authenticated
  using (public.is_super_admin());

commit;
