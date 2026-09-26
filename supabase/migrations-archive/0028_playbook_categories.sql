-- 0028_playbook_categories.sql
--
-- Managed lookup table for Playbook categories — admins can rename, recolor,
-- and reorder from Settings → Playbooks. Same shape as event_categories
-- (0015): each row maps to a chip color class so the UI doesn't hardcode
-- hex colors.
--
-- Seeds the 6 categories the static Playbooks page previously hardcoded
-- (Worship, Facilities, Tech, Safety, People, Youth). The original page used
-- inline hex colors per category; we map each to the closest existing chip
-- class so the design system stays the single source of truth for color.
--
-- Depends on 0001 (is_staff, is_super_admin, set_updated_at).

begin;

create table if not exists public.playbook_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  chip_class  text not null default 'rsd-chip-mute',
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists playbook_categories_name_active_uniq
  on public.playbook_categories (lower(name))
  where deleted_at is null;

create index if not exists playbook_categories_sort_idx
  on public.playbook_categories (sort_order, name)
  where deleted_at is null;

drop trigger if exists playbook_categories_set_updated_at on public.playbook_categories;
create trigger playbook_categories_set_updated_at
  before update on public.playbook_categories
  for each row execute function public.set_updated_at();

-- Seed the categories the old hardcoded page used. Skip any that already
-- exist (case-insensitive) so re-running is a no-op.
insert into public.playbook_categories (name, chip_class, sort_order)
select * from (values
  ('Worship',    'rsd-chip-accent',  10),
  ('Facilities', 'rsd-chip-warn',    20),
  ('Tech',       'rsd-chip-mute',    30),
  ('Safety',     'rsd-chip-error',   40),
  ('People',     'rsd-chip-success', 50),
  ('Youth',      'rsd-chip-mute',    60)
) as src(name, chip_class, sort_order)
where not exists (
  select 1 from public.playbook_categories pc
  where lower(pc.name) = lower(src.name) and pc.deleted_at is null
);

alter table public.playbook_categories enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'playbook_categories'
  loop
    execute format('drop policy if exists %I on public.playbook_categories', r.policyname);
  end loop;
end $$;

create policy "playbook_categories_select_active" on public.playbook_categories
  for select to authenticated
  using (deleted_at is null);

create policy "playbook_categories_select_deleted_super" on public.playbook_categories
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "playbook_categories_insert_staff" on public.playbook_categories
  for insert to authenticated
  with check (public.is_staff());

create policy "playbook_categories_update_staff" on public.playbook_categories
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "playbook_categories_update_super" on public.playbook_categories
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "playbook_categories_delete_super" on public.playbook_categories
  for delete to authenticated
  using (public.is_super_admin());

commit;
