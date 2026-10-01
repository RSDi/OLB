-- 0114_sidebar_links_in_portal.sql
--
-- Sidebar links (0097) get a third way to open: inside the portal. The
-- linked site shows in a frame on /portal/links/<id>, with the sidebar and
-- top bar still around it, so it feels like part of the portal.
--
-- open_in_frame is its own column, so a link set to open inside the portal
-- has open_in_new_tab off: code from before this migration just opens it in
-- the same tab. The two can't both be on, and only an outside site (not a
-- portal page, which is already inside the portal) opens in a frame.
--
-- Apply via the Supabase SQL editor, after 0113. Idempotent.

begin;

alter table public.sidebar_links
  add column if not exists open_in_frame boolean not null default false;

alter table public.sidebar_links
  drop constraint if exists sidebar_links_one_open_mode;
alter table public.sidebar_links
  add constraint sidebar_links_one_open_mode check (not (open_in_frame and open_in_new_tab));

alter table public.sidebar_links
  drop constraint if exists sidebar_links_frame_outside_only;
alter table public.sidebar_links
  add constraint sidebar_links_frame_outside_only check (not open_in_frame or url ~* '^https?://');

commit;
