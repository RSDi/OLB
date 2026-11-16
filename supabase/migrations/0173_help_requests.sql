-- 0173_help_requests.sql
--
-- Ask for help (top-bar ? → Ask for help). Anyone signed in sends a
-- question, a problem or an idea, with an optional screenshot and an
-- optional screen recording. Each one posts in Slack (#olb-help) and lands
-- in Help Requests for the board, who reply there; the person who asked
-- reads the replies under ? → My requests.
--
-- The app reads and writes these through the admin client after its own
-- check (lib/help-requests), like game_film_markers, so only service_role
-- gets Data API access. Files go to the private help-requests bucket
-- through signed upload links.

create table if not exists public.help_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  member_id        uuid references public.members(id) on delete set null,
  asker_name       text not null,
  asker_email      text,
  body             text not null check (char_length(btrim(body)) between 1 and 5000),
  page_url         text,
  page_title       text,
  user_agent       text,
  screenshot_path  text,
  video_path       text,
  -- A board reply the asker hasn't opened yet (the dot on ?).
  asker_unread     boolean not null default false,
  -- The asker wrote last and nobody on the board has answered.
  needs_reply      boolean not null default true,
  closed_at        timestamptz,
  closed_by        text,
  slack_channel    text,
  slack_ts         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists help_requests_user_idx
  on public.help_requests (user_id, updated_at desc);
create index if not exists help_requests_open_idx
  on public.help_requests (updated_at desc) where closed_at is null;

create table if not exists public.help_request_messages (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.help_requests(id) on delete cascade,
  from_asker   boolean not null,
  author_name  text not null,
  body         text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at   timestamptz not null default now()
);

create index if not exists help_request_messages_request_idx
  on public.help_request_messages (request_id, created_at);

alter table public.help_requests enable row level security;
alter table public.help_request_messages enable row level security;

revoke all on table public.help_requests from public, anon, authenticated;
revoke all on table public.help_request_messages from public, anon, authenticated;
grant select, insert, update, delete on public.help_requests to service_role;
grant select, insert, update, delete on public.help_request_messages to service_role;

-- Screenshots (5 MB) and screen recordings (50 MB), private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('help-requests', 'help-requests', false, 52428800,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif',
              'video/webm', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
