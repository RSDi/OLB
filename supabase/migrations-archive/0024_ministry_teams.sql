-- 0024_ministry_teams.sql
--
-- Many-to-many ministry team membership. A member can serve on Worship,
-- Kids, and Hospitality simultaneously; a team has many members. The role
-- column distinguishes a team lead from a regular member.
--
-- Visibility: approved members see teams and assignments (so the "Contact a
-- worship team member" use case works). Staff manage both tables.
--
-- Depends on 0001 (is_staff, is_super_admin), 0019 (is_approved).

begin;

create table if not exists public.ministry_teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  chip_class  text not null default 'rsd-chip-mute',
  created_at  timestamptz not null default now()
);

create table if not exists public.member_ministries (
  member_id  uuid not null references public.members(id)        on delete cascade,
  team_id    uuid not null references public.ministry_teams(id) on delete cascade,
  role       text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (member_id, team_id),
  constraint member_ministries_role_check
    check (role in ('lead', 'member'))
);

create index if not exists member_ministries_team_idx
  on public.member_ministries (team_id);

-- RLS.
alter table public.ministry_teams enable row level security;
alter table public.member_ministries enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('ministry_teams', 'member_ministries')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ministry_teams: approved members read, staff write.
create policy "ministry_teams_select_approved" on public.ministry_teams
  for select to authenticated
  using (public.is_approved());

create policy "ministry_teams_insert_staff" on public.ministry_teams
  for insert to authenticated
  with check (public.is_staff());

create policy "ministry_teams_update_staff" on public.ministry_teams
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "ministry_teams_delete_staff" on public.ministry_teams
  for delete to authenticated
  using (public.is_staff());

-- member_ministries: approved members read, staff write.
create policy "member_ministries_select_approved" on public.member_ministries
  for select to authenticated
  using (public.is_approved());

create policy "member_ministries_insert_staff" on public.member_ministries
  for insert to authenticated
  with check (public.is_staff());

create policy "member_ministries_update_staff" on public.member_ministries
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "member_ministries_delete_staff" on public.member_ministries
  for delete to authenticated
  using (public.is_staff());

-- Seed common teams. Idempotent via the unique constraint on name.
insert into public.ministry_teams (name, description, chip_class) values
  ('Worship',     'Sunday worship team',                     'rsd-chip-accent'),
  ('Kids',        'Children''s ministry volunteers',         'rsd-chip-mute'),
  ('Youth',       'Middle school + high school ministry',    'rsd-chip-mute'),
  ('Ushers',      'Greeters and ushers',                     'rsd-chip-mute'),
  ('Hospitality', 'Coffee, meals, fellowship setup',         'rsd-chip-mute'),
  ('Tech',        'A/V and sound',                           'rsd-chip-mute'),
  ('Deacons',     'Diaconate',                               'rsd-chip-mute'),
  ('Prayer',      'Prayer team',                             'rsd-chip-mute')
on conflict (name) do nothing;

commit;
