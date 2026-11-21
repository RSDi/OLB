-- 0181_film_activity.sql
--
-- Settings → Website Activity gets a Team film section, and team film pages
-- (/watch/...) come out of the club website's numbers, like the Shootout's
-- busy times already do.
--
--   website_events.event_type   adds 'film_play': someone pressed play on a
--                               game on a team film page. path is the team
--                               page, label the game ("vs KC East · Nov 14"),
--                               meta { upload_id }.
--   website_visits, website_daily_30d, website_top_pages_30d,
--   website_sources_30d, website_funnel_30d
--                               now leave out /watch events, so the four
--                               numbers, the chart, pages, sources and recent
--                               visits are the club website only.
--   website_page_views          area 'film' for /watch pages (busy times
--                               read area 'site', so film drops out there too).
--   website_film_teams_30d      per team: people, visits, page views, plays,
--                               people who played, phones. The team is the
--                               page address without its random key, so a
--                               new link keeps counting on the same row.
--   website_film_games_30d      per game: plays, people, last played.
--   website_film_totals_30d     all team film pages together: the same numbers.
--
-- Read models only (no new table, sequence or function). security_invoker,
-- so the website_events policy (can_see_activity()) still decides who sees
-- what. Idempotent.

begin;

alter table public.website_events drop constraint if exists website_events_event_type_check;
alter table public.website_events
  add constraint website_events_event_type_check
  check (event_type in ('page_view', 'reg_started', 'reg_submitted', 'film_play'));

-- ─── The club website, without team film pages ──────────────────────────────

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
   where path not like '/watch%'
   group by visit_id;

create or replace view public.website_daily_30d
  with (security_invoker = true) as
  select (created_at at time zone 'America/Chicago')::date as day,
         count(distinct visitor_id)                        as visitors,
         count(distinct visit_id)                          as visits,
         count(*) filter (where event_type = 'page_view')  as views
    from public.website_events
   where created_at >= now() - interval '30 days'
     and path not like '/watch%'
   group by 1;

create or replace view public.website_top_pages_30d
  with (security_invoker = true) as
  select split_part(path, '?', 1)   as page,
         count(*)                   as views,
         count(distinct visitor_id) as visitors
    from public.website_events
   where event_type = 'page_view'
     and created_at >= now() - interval '30 days'
     and path not like '/watch%'
   group by 1;

create or replace view public.website_sources_30d
  with (security_invoker = true) as
  select coalesce(nullif(source, ''), 'Direct') as source,
         count(*)                               as visits,
         count(distinct visitor_id)             as visitors
    from public.website_visits
   where started_at >= now() - interval '30 days'
   group by 1;

create or replace view public.website_funnel_30d
  with (security_invoker = true) as
  select count(distinct visitor_id)                                       as visitors,
         count(distinct visitor_id) filter (where event_type = 'page_view'
                                              and path like '/player-registration%') as opened,
         count(distinct visitor_id) filter (where event_type = 'reg_started')   as started,
         count(distinct visitor_id) filter (where event_type = 'reg_submitted') as submitted
    from public.website_events
   where created_at >= now() - interval '30 days'
     and path not like '/watch%';

create or replace view public.website_page_views
  with (security_invoker = true) as
  select id,
         visitor_id,
         visit_id,
         path,
         device,
         created_at,
         case
           when path like '/shootout/tv%'    then 'shootout_tv'
           when path like '/shootout/score%' then 'shootout_score'
           when path like '/shootout/signs%' then 'shootout_signs'
           when path = '/shootout' or path like '/shootout?%' or path like '/shootout/%' then 'shootout'
           when path = '/watch' or path like '/watch?%' or path like '/watch/%' then 'film'
           else 'site'
         end                                                       as area,
         (created_at at time zone 'America/Chicago')::date        as day,
         extract(isodow from created_at at time zone 'America/Chicago')::int as weekday,  -- 1 Monday … 7 Sunday
         extract(hour from created_at at time zone 'America/Chicago')::int   as hour
    from public.website_events
   where event_type = 'page_view';

-- ─── Team film ───────────────────────────────────────────────────────────────

-- '/watch/hs-jv-3f9a0c7e1b2d?v=…' → '/watch/hs-jv'. '/watch' stays '/watch'.
create or replace view public.website_film_events
  with (security_invoker = true) as
  select visitor_id,
         visit_id,
         event_type,
         device,
         label,
         meta,
         created_at,
         regexp_replace(split_part(path, '?', 1), '-[0-9a-f]{12}$', '') as team_page
    from public.website_events
   where event_type in ('page_view', 'film_play')
     and (path = '/watch' or path like '/watch?%' or path like '/watch/%');

create or replace view public.website_film_teams_30d
  with (security_invoker = true) as
  select team_page,
         count(distinct visitor_id)                                         as visitors,
         count(distinct visit_id)                                           as visits,
         count(*) filter (where event_type = 'page_view')                   as views,
         count(*) filter (where event_type = 'film_play')                   as plays,
         count(distinct visitor_id) filter (where event_type = 'film_play') as players,
         count(distinct visitor_id) filter (where device = 'phone')         as phones
    from public.website_film_events
   where created_at >= now() - interval '30 days'
   group by team_page;

create or replace view public.website_film_games_30d
  with (security_invoker = true) as
  select meta->>'upload_id'          as upload_id,
         team_page,
         max(label)                  as label,
         count(*)                    as plays,
         count(distinct visitor_id)  as visitors,
         max(created_at)             as last_at
    from public.website_film_events
   where event_type = 'film_play'
     and created_at >= now() - interval '30 days'
     and meta ? 'upload_id'
   group by meta->>'upload_id', team_page;

create or replace view public.website_film_totals_30d
  with (security_invoker = true) as
  select count(distinct visitor_id)                                         as visitors,
         count(distinct visit_id)                                           as visits,
         count(*) filter (where event_type = 'page_view')                   as views,
         count(*) filter (where event_type = 'film_play')                   as plays,
         count(distinct visitor_id) filter (where event_type = 'film_play') as players,
         count(distinct visitor_id) filter (where device = 'phone')         as phones
    from public.website_film_events
   where created_at >= now() - interval '30 days';

revoke all on public.website_film_events,
              public.website_film_teams_30d,
              public.website_film_games_30d,
              public.website_film_totals_30d
  from anon;

grant select on public.website_film_events,
                public.website_film_teams_30d,
                public.website_film_games_30d,
                public.website_film_totals_30d
  to authenticated, service_role;

commit;
