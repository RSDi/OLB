-- 0166_website_busy_times.sql
--
-- Settings → Website Activity: busy times, and the Missouri River Shootout's
-- pages broken out. The Shootout's pages (/shootout and the TV, scorer's
-- table and sign pages under it) now send page views to website_events
-- (0161) like the rest of the public site; these views read them back.
--
-- website_page_views: each page view with its area and its Central-time day,
-- weekday and hour.
--   area: 'shootout'        the live scores page fans open from the QR signs
--         'shootout_tv'     the TV screens in the gym
--         'shootout_score'  the scorer's tables
--         'shootout_signs'  the printable signs
--         'site'            everything else on the club website
-- website_hourly: people and page views per area, day and hour.
-- website_areas_60d: people, visits and page views per area, last 60 days.
--
-- Read models only (no new table, sequence or function). security_invoker,
-- so the website_events policy (can_see_activity()) still decides who sees
-- what. Apply via the Supabase SQL editor, after 0165. Idempotent.

begin;

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
           else 'site'
         end                                                       as area,
         (created_at at time zone 'America/Chicago')::date        as day,
         extract(isodow from created_at at time zone 'America/Chicago')::int as weekday,  -- 1 Monday … 7 Sunday
         extract(hour from created_at at time zone 'America/Chicago')::int   as hour
    from public.website_events
   where event_type = 'page_view';

create or replace view public.website_hourly
  with (security_invoker = true) as
  select area,
         day,
         weekday,
         hour,
         count(distinct visitor_id) as visitors,
         count(*)                   as views
    from public.website_page_views
   group by area, day, weekday, hour;

create or replace view public.website_areas_60d
  with (security_invoker = true) as
  select area,
         count(distinct visitor_id)                                   as visitors,
         count(distinct visit_id)                                     as visits,
         count(*)                                                     as views,
         count(distinct visitor_id) filter (where device = 'phone')   as phones,
         min(created_at)                                              as first_at,
         max(created_at)                                              as last_at
    from public.website_page_views
   where created_at >= now() - interval '60 days'
   group by area;

revoke all on public.website_page_views, public.website_hourly, public.website_areas_60d from anon;

grant select on public.website_page_views,
                public.website_hourly,
                public.website_areas_60d
  to authenticated, service_role;

commit;
