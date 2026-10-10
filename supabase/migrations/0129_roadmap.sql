-- 0129_roadmap.sql
--
-- The portal's roadmap (/portal/roadmap): what's live, what's being built,
-- what's planned, and ideas. Hand-entered by super-admins, and still in
-- preview (lib/auth/feature-preview.ts). Families can be sent a read-only
-- copy at /roadmap/<key>.
--
--   olb_roadmap_items   one row per item. status is the board column:
--                       released / progress / planned / proposed. A released
--                       item carries the day it went live (released_on);
--                       nothing else does. Areas are checked in app code
--                       (lib/roadmap/model.ts), so adding one is a code
--                       change, not a migration. Deleting is soft.
--   olb_roadmap_link    a single row: the key for the public link. Null means
--                       the link is off; a new key retires the old link. The
--                       public page reads it with the service role.
--
-- Super-admins only, here and in the actions (lib/roadmap/actions.ts).
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0128. Idempotent.

begin;

create table if not exists public.olb_roadmap_items (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 2000),
  area         text not null,
  status       text not null check (status in ('released', 'progress', 'planned', 'proposed')),
  released_on  date,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  -- Live items have a date; nothing else does.
  constraint olb_roadmap_items_released_check
    check ((status = 'released') = (released_on is not null))
);

create index if not exists olb_roadmap_items_live_idx
  on public.olb_roadmap_items (status, released_on desc) where deleted_at is null;

drop trigger if exists olb_roadmap_items_set_updated_at on public.olb_roadmap_items;
create trigger olb_roadmap_items_set_updated_at before update on public.olb_roadmap_items
  for each row execute function public.set_updated_at();

alter table public.olb_roadmap_items enable row level security;

drop policy if exists "olb_roadmap_items_select" on public.olb_roadmap_items;
create policy "olb_roadmap_items_select" on public.olb_roadmap_items
  for select to authenticated
  using ((select public.is_super_admin()));

drop policy if exists "olb_roadmap_items_insert" on public.olb_roadmap_items;
create policy "olb_roadmap_items_insert" on public.olb_roadmap_items
  for insert to authenticated
  with check ((select public.is_super_admin()) and created_by = (select auth.uid()));

drop policy if exists "olb_roadmap_items_update" on public.olb_roadmap_items;
create policy "olb_roadmap_items_update" on public.olb_roadmap_items
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

create table if not exists public.olb_roadmap_link (
  id          boolean primary key default true check (id),
  key         text,
  updated_at  timestamptz not null default now()
);

insert into public.olb_roadmap_link (id) values (true) on conflict (id) do nothing;

alter table public.olb_roadmap_link enable row level security;

drop policy if exists "olb_roadmap_link_select" on public.olb_roadmap_link;
create policy "olb_roadmap_link_select" on public.olb_roadmap_link
  for select to authenticated
  using ((select public.is_super_admin()));

drop policy if exists "olb_roadmap_link_update" on public.olb_roadmap_link;
create policy "olb_roadmap_link_update" on public.olb_roadmap_link
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

commit;

notify pgrst, 'reload schema';
