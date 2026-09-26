-- 0003_priorities.sql
--
-- Priorities are the urgency levels a maintenance request can have.
-- Manageable from settings so the building committee can adjust labels or
-- add tiers without code changes.
--
-- `key` is the stable identifier used by code (matches the four values
-- already hardcoded in the form: low/medium/high/emergency). `label` is the
-- display string. `severity` orders them on screens. `chip_class` lets the
-- UI render the existing rsd-chip variants without hardcoding a mapping.
--
-- Depends on 0001 (is_staff(), is_super_admin()).

begin;

create table if not exists public.priorities (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,
  label       text not null,
  severity    int  not null default 0,
  chip_class  text not null default 'rsd-chip-mute',
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists priorities_key_active_uniq
  on public.priorities (key)
  where deleted_at is null;

create index if not exists priorities_severity_idx
  on public.priorities (severity desc)
  where deleted_at is null;

-- Seed.
insert into public.priorities (key, label, severity, chip_class)
select v.key, v.label, v.severity, v.chip_class
from (values
  ('low',       'Low',       10, 'rsd-chip-success'),
  ('medium',    'Medium',    20, 'rsd-chip-mute'),
  ('high',      'High',      30, 'rsd-chip-warn'),
  ('emergency', 'Emergency', 40, 'rsd-chip-error')
) as v(key, label, severity, chip_class)
where not exists (
  select 1 from public.priorities p
  where p.key = v.key and p.deleted_at is null
);

-- RLS
alter table public.priorities enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'priorities'
  loop
    execute format('drop policy if exists %I on public.priorities', r.policyname);
  end loop;
end $$;

create policy "priorities_select_active" on public.priorities
  for select to anon, authenticated
  using (deleted_at is null);

create policy "priorities_select_deleted_super" on public.priorities
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "priorities_insert_staff" on public.priorities
  for insert to authenticated
  with check (public.is_staff());

create policy "priorities_update_staff" on public.priorities
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "priorities_update_super" on public.priorities
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "priorities_delete_super" on public.priorities
  for delete to authenticated
  using (public.is_super_admin());

commit;
