-- 0004_area_members.sql
--
-- Per-area volunteer assignments. A member can be an `owner` (1-2 per area
-- expected) or a `helper`. Used for visibility now; will drive notification
-- routing in Phase 2.
--
-- Assignments are removed (hard delete) when no longer applicable — there is
-- no soft-delete here because the audit value is low and the join is small.
--
-- Depends on 0001 (is_staff()) and 0002 (areas).

begin;

create table if not exists public.area_members (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references public.areas(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  role       text not null,
  created_at timestamptz not null default now(),
  constraint area_members_role_check check (role in ('owner','helper')),
  constraint area_members_unique unique (area_id, member_id)
);

create index if not exists area_members_area_idx on public.area_members (area_id);
create index if not exists area_members_member_idx on public.area_members (member_id);

-- RLS
alter table public.area_members enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'area_members'
  loop
    execute format('drop policy if exists %I on public.area_members', r.policyname);
  end loop;
end $$;

-- Staff see every assignment (assignment UI in settings).
create policy "area_members_select_staff" on public.area_members
  for select to authenticated
  using (public.is_staff());

-- A member can see their own assignments (so the portal can show "you own
-- the Nursery"). Joined via members.user_id = auth.uid().
create policy "area_members_select_self" on public.area_members
  for select to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = area_members.member_id and m.user_id = auth.uid()
    )
  );

create policy "area_members_insert_staff" on public.area_members
  for insert to authenticated
  with check (public.is_staff());

create policy "area_members_update_staff" on public.area_members
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "area_members_delete_staff" on public.area_members
  for delete to authenticated
  using (public.is_staff());

commit;
