-- 0169_sponsor_clicks.sql
--
-- Sponsor link clicks. Sponsor logos on the live scores page (/shootout) and
-- the website's Sponsors page link to /go/<sponsor>?from=live|site, which
-- records a row here and sends the visitor on to the sponsor's site.
--
--   sponsor     the sponsor's slug (lib/sponsors/links.ts): nelson, dundee, team-time
--   source      where the logo was: 'live' (live scores) or 'site' (Sponsors page)
--   visitor_id  the browser (the olb_vid cookie from 0161), so "people" counts
--               phones, not taps; no names or personal details
--   device      phone | tablet | computer
--
-- Written only by the server with the service role (after it drops bots and
-- repeat taps); the board reads the counts on the tournament plan.
-- Apply via the Supabase SQL editor. Idempotent.

begin;

create table if not exists public.sponsor_clicks (
  id          uuid primary key default gen_random_uuid(),
  sponsor     text not null check (sponsor ~ '^[a-z0-9-]{1,40}$'),
  source      text not null default '' check (source in ('', 'live', 'site')),
  visitor_id  uuid not null,
  device      text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists sponsor_clicks_sponsor_at on public.sponsor_clicks (sponsor, created_at desc);
create index if not exists sponsor_clicks_visitor_at on public.sponsor_clicks (visitor_id, sponsor, created_at desc);

alter table public.sponsor_clicks enable row level security;

drop policy if exists sponsor_clicks_board_read on public.sponsor_clicks;
create policy sponsor_clicks_board_read on public.sponsor_clicks
  for select to authenticated
  using ((select public.is_staff()));

grant select, insert, update, delete on public.sponsor_clicks to authenticated, service_role;

commit;
