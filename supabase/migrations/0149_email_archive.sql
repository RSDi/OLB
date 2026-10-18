-- 0149_email_archive.sql
--
-- Copies of emails the board references (Archives → Email), so everyone
-- can open them without Jeff's Gmail. Jeff's agent imports a thread with
-- POST /api/agent/email-archive (service role). The board reads the rows
-- the same way it reads planning_meetings: staff SELECT, no client writes.
--
-- Also adds `scopes` on olb_agent_keys (0146 / PR #208). Keys minted before
-- this migration stay read-only (`{read}`). Importing mail needs
-- `email_archive:write` on the key.
--
-- Numbering: 0146 is agent keys (PR #208). 0147 is YouTube privacy (#207).
-- 0148 is film templates (#209). 0150 (hosted tournaments, #175) is already
-- on main. Apply this after 0148.
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0148. Idempotent. Draft PR — do not apply to production until Jeff
-- says so.

begin;

-- ─── Agent key scopes (extends 0146) ────────────────────────────────────────

alter table public.olb_agent_keys
  add column if not exists scopes text[] not null default array['read']::text[];

alter table public.olb_agent_keys drop constraint if exists olb_agent_keys_scopes_valid;
alter table public.olb_agent_keys
  add constraint olb_agent_keys_scopes_valid
  check (
    cardinality(scopes) >= 1
    and scopes <@ array['read', 'email_archive:write']::text[]
  );

-- ─── Threads ────────────────────────────────────────────────────────────────

create table if not exists public.email_archive_threads (
  id                uuid primary key default gen_random_uuid(),
  gmail_thread_id   text not null unique,
  source_mailbox    text not null,
  subject           text not null default '',
  participants      text[] not null default '{}',
  first_message_at  timestamptz,
  last_message_at   timestamptz,
  message_count     int not null default 0
                      check (message_count >= 0),
  added_by          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint email_archive_threads_gmail_id
    check (char_length(btrim(gmail_thread_id)) between 6 and 128),
  constraint email_archive_threads_mailbox
    check (char_length(btrim(source_mailbox)) between 1 and 120)
);

drop trigger if exists email_archive_threads_set_updated_at on public.email_archive_threads;
create trigger email_archive_threads_set_updated_at
  before update on public.email_archive_threads
  for each row execute function public.set_updated_at();

create index if not exists email_archive_threads_last_msg_idx
  on public.email_archive_threads (last_message_at desc nulls last);

-- ─── Messages ───────────────────────────────────────────────────────────────

create table if not exists public.email_archive_messages (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references public.email_archive_threads(id) on delete cascade,
  gmail_message_id  text not null unique,
  from_addr         text not null default '',
  to_addrs          text[] not null default '{}',
  cc_addrs          text[] not null default '{}',
  sent_at           timestamptz not null,
  subject           text not null default '',
  body_text         text not null default '',
  body_html         text not null default '',
  snippet           text not null default '',
  created_at        timestamptz not null default now(),
  constraint email_archive_messages_gmail_id
    check (char_length(btrim(gmail_message_id)) between 6 and 128)
);

create index if not exists email_archive_messages_thread_sent_idx
  on public.email_archive_messages (thread_id, sent_at);

-- ─── Attachments (bytes in private email-archive-files bucket) ──────────────

create table if not exists public.email_archive_attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.email_archive_messages(id) on delete cascade,
  filename      text not null,
  mime          text not null default 'application/octet-stream',
  size_bytes    bigint,
  storage_path  text not null unique,
  created_at    timestamptz not null default now(),
  constraint email_archive_attachments_filename
    check (char_length(btrim(filename)) between 1 and 260)
);

create index if not exists email_archive_attachments_message_idx
  on public.email_archive_attachments (message_id);

-- ─── Links from a thread to a board meeting agenda item ─────────────────────

create table if not exists public.email_archive_links (
  id                   uuid primary key default gen_random_uuid(),
  thread_id            uuid not null references public.email_archive_threads(id) on delete cascade,
  planning_meeting_id  uuid not null references public.planning_meetings(id) on delete cascade,
  agenda_item_label    text not null default '',
  created_at           timestamptz not null default now(),
  constraint email_archive_links_label
    check (char_length(agenda_item_label) <= 200)
);

create unique index if not exists email_archive_links_unique
  on public.email_archive_links (thread_id, planning_meeting_id, agenda_item_label);

create index if not exists email_archive_links_meeting_idx
  on public.email_archive_links (planning_meeting_id);

-- ─── RLS: board/staff read; server-only writes (service role) ───────────────

alter table public.email_archive_threads enable row level security;
alter table public.email_archive_messages enable row level security;
alter table public.email_archive_attachments enable row level security;
alter table public.email_archive_links enable row level security;

revoke all on table public.email_archive_threads from public, anon;
revoke all on table public.email_archive_messages from public, anon;
revoke all on table public.email_archive_attachments from public, anon;
revoke all on table public.email_archive_links from public, anon;

grant select on table public.email_archive_threads to authenticated;
grant select on table public.email_archive_messages to authenticated;
grant select on table public.email_archive_attachments to authenticated;
grant select on table public.email_archive_links to authenticated;

drop policy if exists "email_archive_threads_select_staff" on public.email_archive_threads;
create policy "email_archive_threads_select_staff" on public.email_archive_threads
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "email_archive_messages_select_staff" on public.email_archive_messages;
create policy "email_archive_messages_select_staff" on public.email_archive_messages
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "email_archive_attachments_select_staff" on public.email_archive_attachments;
create policy "email_archive_attachments_select_staff" on public.email_archive_attachments
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "email_archive_links_select_staff" on public.email_archive_links;
create policy "email_archive_links_select_staff" on public.email_archive_links
  for select to authenticated
  using ((select public.is_staff()));

-- ─── Private bucket. No storage.objects policies: the app signs URLs with
-- the service role after a staff check, same as slack-archive-files. ─────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('email-archive-files', 'email-archive-files', false, 15728640)
on conflict (id) do nothing;

commit;
