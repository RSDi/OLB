-- 0096_sidebar_links.sql
--
-- Custom links in the portal sidebar, managed from Settings → Sidebar Links:
-- a label plus a web address (e.g. "Schedule" →
-- https://schedule.omahalightningbasketball.com/), or a portal path like
-- /portal/docs. They show under the built-in nav items, in sort_order.
-- open_in_new_tab defaults on, so an outside site opens in its own tab.
--
-- Every approved member (and staff) can read them, since everyone sees the
-- sidebar. Only super-admins write.
--
-- Apply via the Supabase SQL editor, after 0095. Idempotent.

begin;

create table if not exists public.sidebar_links (
  id               uuid primary key default gen_random_uuid(),
  label            text not null check (length(btrim(label)) between 1 and 40),
  url              text not null check (url ~* '^(https?://[^\s]+|/[^/\s][^\s]*)$'),
  open_in_new_tab  boolean not null default true,
  sort_order       int  not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists sidebar_links_sort_idx on public.sidebar_links (sort_order, label);

drop trigger if exists sidebar_links_set_updated_at on public.sidebar_links;
create trigger sidebar_links_set_updated_at
  before update on public.sidebar_links
  for each row execute function public.set_updated_at();

alter table public.sidebar_links enable row level security;

drop policy if exists "sidebar_links_select_approved" on public.sidebar_links;
create policy "sidebar_links_select_approved" on public.sidebar_links
  for select to authenticated
  using ((select public.is_approved()) or (select public.is_staff()));

-- Staff write policies from an earlier draft of this migration.
drop policy if exists "sidebar_links_insert_staff" on public.sidebar_links;
drop policy if exists "sidebar_links_update_staff" on public.sidebar_links;
drop policy if exists "sidebar_links_delete_staff" on public.sidebar_links;

drop policy if exists "sidebar_links_super_all" on public.sidebar_links;
create policy "sidebar_links_super_all" on public.sidebar_links
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- The first link: the season schedule.
insert into public.sidebar_links (label, url, open_in_new_tab, sort_order)
select 'Schedule', 'https://schedule.omahalightningbasketball.com/', true, 10
where not exists (select 1 from public.sidebar_links where lower(label) = 'schedule');

commit;
