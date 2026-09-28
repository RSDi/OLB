-- 0099_activity_and_preview.sql
--
-- Activity trail, usage stats and "Preview as" for super-admins (the
-- /portal/activity page).
--
-- activity_events: one row per sign-in, sign-out, page view and preview
-- start/stop. `sid` is the Supabase Auth session id (the `session_id` claim in
-- the access token), so every event from one sign-in shares it. user_id and
-- impersonator_user_id are soft refs to auth.users on purpose, with no FK: an
-- audit trail has to outlive the account it describes.
--
-- member_previews: one row per "Preview as". A super-admin is signed in to a
-- real session for the member they preview (so every page and every RLS
-- policy behaves exactly as it does for that member); this row ties that
-- session back to the super-admin, drives the banner and the way back, and
-- records when the preview started and ended. The browser holds a random
-- secret for it in an httpOnly cookie; only its hash is stored here.
--
-- Both tables are written only by the server (service role). Super-admins
-- can read them; nobody else can.
--
-- member_audit_log gains impersonator_user_id: a change made during a
-- preview is credited to the super-admin behind it ("Jeff (as Pat)").
--
-- Apply via the Supabase SQL editor, after 0098. Idempotent.

begin;

-- ─── Activity events ────────────────────────────────────────────────────────

create table if not exists public.activity_events (
  id                   uuid primary key default gen_random_uuid(),
  sid                  uuid,                        -- auth session id; null if unknown
  user_id              uuid not null,               -- ACTIVE identity (the member, during a preview)
  user_name            text not null default '',
  role                 text not null default '',
  event_type           text not null check (event_type in
                         ('login', 'logout', 'page_view', 'preview_start', 'preview_stop')),
  path                 text not null default '',    -- pathname + query, e.g. /portal/directory?team=…
  impersonator_user_id uuid,                        -- set on preview_* and every event during a preview
  impersonator_sid     uuid,                        -- the super-admin's own session when the preview began
  meta                 jsonb not null default '{}'::jsonb,  -- { via, user_agent, reason, impersonator_name }
  created_at           timestamptz not null default now()
);

create index if not exists activity_events_sid_idx  on public.activity_events (sid, created_at);
create index if not exists activity_events_user_idx on public.activity_events (user_id, created_at desc);
create index if not exists activity_events_type_idx on public.activity_events (event_type, created_at desc);

alter table public.activity_events enable row level security;

drop policy if exists "activity_events_select_super" on public.activity_events;
create policy "activity_events_select_super" on public.activity_events
  for select to authenticated
  using ((select public.is_super_admin()));

-- supabase-js can't GROUP BY, so the read models are views. security_invoker
-- makes them run as the caller, so the table's super-admin-only policy holds.

-- One row per sign-in session: the sessions list.
create or replace view public.activity_session_summary
  with (security_invoker = true) as
  select sid,
         user_id,
         min(created_at)                                  as started_at,
         max(created_at)                                  as last_event_at,
         count(*) filter (where event_type = 'page_view') as page_views,
         bool_or(event_type = 'preview_start')            as is_preview,
         max(impersonator_user_id::text)::uuid            as impersonator_user_id
    from public.activity_events
   where sid is not null
   group by sid, user_id;

-- One row per member: last sign-in, last seen, sessions in the last 30 days.
-- A preview isn't the member signing in, so preview sessions don't count.
create or replace view public.activity_user_summary
  with (security_invoker = true) as
  select user_id,
         max(created_at) filter (where event_type = 'login')     as last_login_at,
         max(created_at) filter (where event_type = 'page_view'
                                   and impersonator_user_id is null) as last_seen_at,
         count(distinct sid) filter (
           where sid is not null
             and impersonator_user_id is null
             and created_at >= now() - interval '30 days'
         )                                                       as sessions_30d,
         count(*) filter (
           where event_type = 'page_view'
             and impersonator_user_id is null
             and created_at >= now() - interval '30 days'
         )                                                       as page_views_30d
    from public.activity_events
   group by user_id;

-- The page each member was last on (their own visits, not previews).
create or replace view public.activity_user_last_view
  with (security_invoker = true) as
  select distinct on (user_id) user_id, path as last_seen_path
    from public.activity_events
   where event_type = 'page_view'
     and impersonator_user_id is null
   order by user_id, created_at desc;

-- Most-visited pages over the last 30 days (members' own visits).
create or replace view public.activity_top_pages_30d
  with (security_invoker = true) as
  select split_part(path, '?', 1)   as page,
         count(*)                   as views,
         count(distinct user_id)    as people
    from public.activity_events
   where event_type = 'page_view'
     and impersonator_user_id is null
     and created_at >= now() - interval '30 days'
   group by 1;

-- People seen each day over the last 30 days (members' own visits), in
-- Central time, the club's.
create or replace view public.activity_daily_30d
  with (security_invoker = true) as
  select (created_at at time zone 'America/Chicago')::date as day,
         count(distinct user_id)                           as people,
         count(*)                                          as views
    from public.activity_events
   where event_type = 'page_view'
     and impersonator_user_id is null
     and created_at >= now() - interval '30 days'
   group by 1;

revoke all on public.activity_events,
              public.activity_session_summary,
              public.activity_user_summary,
              public.activity_user_last_view,
              public.activity_top_pages_30d,
              public.activity_daily_30d
  from anon;

-- ─── Previews ("Preview as") ────────────────────────────────────────────────

create table if not exists public.member_previews (
  id                   uuid primary key default gen_random_uuid(),
  secret_hash          text not null,               -- sha256 hex of the cookie's secret
  impersonator_user_id uuid not null,               -- the super-admin
  impersonator_sid     uuid,                        -- their session when they started
  target_user_id       uuid not null,               -- the member being previewed
  target_member_id     uuid,
  target_session_id    uuid,                        -- the session minted for the preview
  started_at           timestamptz not null default now(),
  expires_at           timestamptz not null,
  ended_at             timestamptz,
  end_reason           text check (end_reason in ('exit', 'logout', 'expired', 'invalid', 'failed'))
);

create index if not exists member_previews_session_idx
  on public.member_previews (target_session_id) where ended_at is null;
create index if not exists member_previews_started_idx
  on public.member_previews (started_at desc);

alter table public.member_previews enable row level security;

drop policy if exists "member_previews_select_super" on public.member_previews;
create policy "member_previews_select_super" on public.member_previews
  for select to authenticated
  using ((select public.is_super_admin()));

revoke all on public.member_previews from anon;

-- The super-admin behind the current request, when it's made from a preview
-- session; null otherwise. Matches on the session id, so the member's own
-- sign-ins on their own devices are never mistaken for a preview.
create or replace function public.current_preview_impersonator()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select p.impersonator_user_id
    from public.member_previews p
   where p.target_user_id = auth.uid()
     and p.target_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
     and p.ended_at is null
   limit 1
$$;

revoke all on function public.current_preview_impersonator() from public, anon;
grant execute on function public.current_preview_impersonator() to authenticated;

-- ─── Member audit log: credit changes made during a preview ────────────────

alter table public.member_audit_log
  add column if not exists impersonator_user_id uuid;

create or replace function public.members_write_audit_log()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_member_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    v_member_id := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_member_id := NEW.id;
  elsif TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_member_id := OLD.id;
  end if;

  -- Skip no-op updates (every column identical). Postgres still fires the
  -- trigger when an UPDATE didn't actually change anything; without this
  -- guard we'd log noise from save-without-edit clicks.
  if TG_OP = 'UPDATE' and v_old is not distinct from v_new then
    return null;
  end if;

  insert into public.member_audit_log
    (member_id, changed_by, action, old_data, new_data, impersonator_user_id)
  values
    (v_member_id, auth.uid(), lower(TG_OP), v_old, v_new, public.current_preview_impersonator());

  return null;
end
$$;

commit;
