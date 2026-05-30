-- 0036_volunteer_teams.sql
--
-- Renames the (previously unused) ministry_teams feature to volunteer_teams
-- and is the schema half of wiring it into the app (settings management tab +
-- directory filter). "Volunteer" is the term MCC uses, not "ministry".
--
-- Idempotent and safe regardless of history: if 0024 was applied we rename the
-- existing tables/index; if it never ran we create the tables fresh. Either way
-- we end with volunteer_teams + member_volunteer_teams, correct RLS, and the
-- seed teams.
--
-- Depends on 0001 (is_staff, is_super_admin), 0019 (is_approved).

begin;

-- 1. Rename existing objects if 0024 was applied. FKs follow a parent rename
--    automatically; the child's role check + PK keep their old names (harmless).
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'ministry_teams') then
    alter table public.ministry_teams rename to volunteer_teams;
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'member_ministries') then
    alter table public.member_ministries rename to member_volunteer_teams;
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'member_ministries_team_idx') then
    alter index public.member_ministries_team_idx rename to member_volunteer_teams_team_idx;
  end if;
end $$;

-- 2. Create from scratch on a DB that never had 0024.
create table if not exists public.volunteer_teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  chip_class  text not null default 'rsd-chip-mute',
  created_at  timestamptz not null default now()
);

create table if not exists public.member_volunteer_teams (
  member_id  uuid not null references public.members(id)         on delete cascade,
  team_id    uuid not null references public.volunteer_teams(id) on delete cascade,
  role       text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (member_id, team_id),
  constraint member_volunteer_teams_role_check
    check (role in ('lead', 'member'))
);

create index if not exists member_volunteer_teams_team_idx
  on public.member_volunteer_teams (team_id);

-- 3. RLS: approved members read (so "contact a worship team member" works),
--    staff manage both tables.
alter table public.volunteer_teams enable row level security;
alter table public.member_volunteer_teams enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('volunteer_teams', 'member_volunteer_teams')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "volunteer_teams_select_approved" on public.volunteer_teams
  for select to authenticated
  using (public.is_approved());

create policy "volunteer_teams_insert_staff" on public.volunteer_teams
  for insert to authenticated
  with check (public.is_staff());

create policy "volunteer_teams_update_staff" on public.volunteer_teams
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "volunteer_teams_delete_staff" on public.volunteer_teams
  for delete to authenticated
  using (public.is_staff());

create policy "member_volunteer_teams_select_approved" on public.member_volunteer_teams
  for select to authenticated
  using (public.is_approved());

create policy "member_volunteer_teams_insert_staff" on public.member_volunteer_teams
  for insert to authenticated
  with check (public.is_staff());

create policy "member_volunteer_teams_update_staff" on public.member_volunteer_teams
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "member_volunteer_teams_delete_staff" on public.member_volunteer_teams
  for delete to authenticated
  using (public.is_staff());

-- 4. Seed common teams (volunteer wording). Idempotent via the unique name.
insert into public.volunteer_teams (name, description, chip_class) values
  ('Worship',     'Sunday worship team',                    'rsd-chip-accent'),
  ('Kids',        'Children''s volunteers',                 'rsd-chip-mute'),
  ('Youth',       'Middle school + high school volunteers',  'rsd-chip-mute'),
  ('Ushers',      'Greeters and ushers',                     'rsd-chip-mute'),
  ('Hospitality', 'Coffee, meals, fellowship setup',         'rsd-chip-mute'),
  ('Tech',        'A/V and sound',                           'rsd-chip-mute'),
  ('Deacons',     'Diaconate',                               'rsd-chip-mute'),
  ('Prayer',      'Prayer team',                             'rsd-chip-mute')
on conflict (name) do nothing;

commit;
