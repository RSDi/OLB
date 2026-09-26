-- 0013_events.sql
--
-- Real events table to replace the hardcoded array on the dashboard +
-- /portal/events. Each row is a single occurrence — recurring events are
-- modeled as multiple rows for now (no recurrence engine yet).
--
-- Fields:
--   title         what it's called
--   description   optional details
--   start_at      when it starts (required)
--   end_at        when it ends (optional)
--   location      free-text location, useful if the area_id doesn't fit
--                 (e.g. "Off-site at Mahoney State Park")
--   area_id       optional structured FK to areas
--   category      free text used for grouping/coloring chips
--                 (Worship, Youth, Study, Admin, Outreach, etc.)
--
-- RLS: approved members can read everything non-deleted (events are not
-- sensitive — visible to everyone in the portal). Staff create/edit.
-- Super-admin soft + hard delete.
--
-- Depends on 0001 (helpers), 0002 (areas).

begin;

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  start_at     timestamptz not null,
  end_at       timestamptz,
  location     text,
  area_id      uuid references public.areas(id),
  category     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint events_end_after_start
    check (end_at is null or end_at >= start_at)
);

create index if not exists events_start_active_idx
  on public.events (start_at)
  where deleted_at is null;

create index if not exists events_category_active_idx
  on public.events (category)
  where deleted_at is null and category is not null;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- RLS
alter table public.events enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'events'
  loop
    execute format('drop policy if exists %I on public.events', r.policyname);
  end loop;
end $$;

-- Any approved authenticated user can see non-deleted events. Pending/denied
-- members can't (the members table gate already excludes them from the portal).
create policy "events_select_authenticated" on public.events
  for select to authenticated
  using (deleted_at is null);

-- Super-admins also see soft-deleted rows.
create policy "events_select_deleted_super" on public.events
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "events_insert_staff" on public.events
  for insert to authenticated
  with check (public.is_staff());

create policy "events_update_staff" on public.events
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "events_update_super" on public.events
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "events_delete_super" on public.events
  for delete to authenticated
  using (public.is_super_admin());

commit;
