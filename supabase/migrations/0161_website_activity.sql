-- 0161_website_activity.sql
--
-- Website activity: what visitors do on the public club website (Settings →
-- Website Activity), the way activity_events (0099) records the portal.
--
-- website_events: one row per page view on the public site, plus two steps of
-- player registration: "reg_started" (the family asked for an email code) and
-- "reg_submitted" (the registration went in). Visitors are anonymous: the
-- browser gets a random visitor id (a first-party cookie, kept a year) and a
-- visit id (a new one after 30 minutes away). No IP address is stored; the
-- rough location is the city and state Vercel works out for each request.
-- A visitor signed in to the portal is credited to their account (user_id),
-- and a submitted registration names its players (label), so a family's
-- visits before they registered can be read back.
--
-- Written only by the server (service role). Readable by the same accounts
-- as the activity trail: can_see_activity() (0100).
--
-- Apply via the Supabase SQL editor, after 0160. Idempotent.

begin;

create table if not exists public.website_events (
  id          uuid primary key default gen_random_uuid(),
  visitor_id  uuid not null,                       -- the browser (olb_vid cookie)
  visit_id    uuid not null,                       -- one visit (olb_visit cookie, 30 minutes)
  event_type  text not null check (event_type in ('page_view', 'reg_started', 'reg_submitted')),
  path        text not null default '',            -- pathname + query, e.g. /player-registration
  source      text not null default '',            -- where the visit came from: Google, Facebook, a site; '' = direct
  referrer    text not null default '',            -- the referring site's host, when it's another site
  device      text not null default '',            -- phone | tablet | computer
  city        text not null default '',
  region      text not null default '',            -- state
  country     text not null default '',
  user_id     uuid,                                -- signed in to the portal: their account
  label       text not null default '',            -- reg_submitted: the players' names
  meta        jsonb not null default '{}'::jsonb,  -- reg_submitted: { registration_ids }
  created_at  timestamptz not null default now()
);

create index if not exists website_events_created_idx on public.website_events (created_at desc);
create index if not exists website_events_visit_idx   on public.website_events (visit_id, created_at);
create index if not exists website_events_visitor_idx on public.website_events (visitor_id, created_at);

alter table public.website_events enable row level security;

drop policy if exists "website_events_select_viewers" on public.website_events;
create policy "website_events_select_viewers" on public.website_events
  for select to authenticated
  using ((select public.can_see_activity()));

-- supabase-js can't GROUP BY, so the read models are views. security_invoker
-- makes them run as the caller, so the table's policy holds.

-- One row per visit.
create or replace view public.website_visits
  with (security_invoker = true) as
  select visit_id,
         min(visitor_id::text)::uuid                        as visitor_id,
         min(created_at)                                    as started_at,
         max(created_at)                                    as last_at,
         count(*) filter (where event_type = 'page_view')   as page_views,
         coalesce(max(nullif(source, '')), '')              as source,
         coalesce(max(nullif(device, '')), '')              as device,
         coalesce(max(nullif(city, '')), '')                as city,
         coalesce(max(nullif(region, '')), '')              as region,
         max(user_id::text)::uuid                           as user_id,
         bool_or(event_type = 'reg_started')                as started_registration,
         bool_or(event_type = 'reg_submitted')              as registered
    from public.website_events
   group by visit_id;

-- Visitors, visits and page views each day, last 30 days, in Central time.
create or replace view public.website_daily_30d
  with (security_invoker = true) as
  select (created_at at time zone 'America/Chicago')::date as day,
         count(distinct visitor_id)                        as visitors,
         count(distinct visit_id)                          as visits,
         count(*) filter (where event_type = 'page_view')  as views
    from public.website_events
   where created_at >= now() - interval '30 days'
   group by 1;

-- Most-visited pages, last 30 days.
create or replace view public.website_top_pages_30d
  with (security_invoker = true) as
  select split_part(path, '?', 1)   as page,
         count(*)                   as views,
         count(distinct visitor_id) as visitors
    from public.website_events
   where event_type = 'page_view'
     and created_at >= now() - interval '30 days'
   group by 1;

-- Where visits came from, last 30 days.
create or replace view public.website_sources_30d
  with (security_invoker = true) as
  select coalesce(nullif(source, ''), 'Direct') as source,
         count(*)                               as visits,
         count(distinct visitor_id)             as visitors
    from public.website_visits
   where started_at >= now() - interval '30 days'
   group by 1;

-- Player registration, step by step, last 30 days (people, not clicks).
create or replace view public.website_funnel_30d
  with (security_invoker = true) as
  select count(distinct visitor_id)                                       as visitors,
         count(distinct visitor_id) filter (where event_type = 'page_view'
                                              and path like '/player-registration%') as opened,
         count(distinct visitor_id) filter (where event_type = 'reg_started')   as started,
         count(distinct visitor_id) filter (where event_type = 'reg_submitted') as submitted
    from public.website_events
   where created_at >= now() - interval '30 days';

revoke all on public.website_events,
              public.website_visits,
              public.website_daily_30d,
              public.website_top_pages_30d,
              public.website_sources_30d,
              public.website_funnel_30d
  from anon;

-- The Data API: the server writes with the service role; the tab reads as
-- the signed-in super-admin, and the policy above narrows that.
grant select, insert on public.website_events to service_role;
grant select on public.website_events to authenticated;
grant select on public.website_visits,
                public.website_daily_30d,
                public.website_top_pages_30d,
                public.website_sources_30d,
                public.website_funnel_30d
  to authenticated, service_role;

commit;
