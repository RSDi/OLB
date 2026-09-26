-- 0030_playbook_versions.sql
--
-- Per-playbook version history. AFTER trigger on `playbooks` snapshots the
-- full content (title, category, excerpt, body_md) on every INSERT and on
-- every UPDATE that actually changes one of the tracked columns.
--
-- version_number is a per-playbook sequence starting at 1. The trigger
-- computes `max + 1` under the row lock that the UPDATE itself already
-- holds, so concurrent updates to the same playbook serialize naturally
-- and no two versions can collide.
--
-- No-op UPDATEs (save without changes) are skipped via `is not distinct
-- from` on a jsonb snapshot of the tracked columns. Mirrors the
-- member_audit_log pattern.
--
-- playbook_id is ON DELETE SET NULL so the version history survives a
-- super-admin hard delete of the parent playbook; the snapshot still
-- contains the title and body. category_id likewise: a deleted category
-- doesn't blow away history.
--
-- RLS: staff read history; nobody can write directly. The trigger runs
-- SECURITY DEFINER so it bypasses RLS to insert rows.
--
-- Depends on 0001 (is_staff), 0028 (playbook_categories), 0029 (playbooks).

begin;

create table if not exists public.playbook_versions (
  id              uuid primary key default gen_random_uuid(),
  playbook_id     uuid references public.playbooks(id) on delete set null,
  version_number  int  not null,
  title           text not null,
  category_id     uuid references public.playbook_categories(id) on delete set null,
  excerpt         text,
  body_md         text not null default '',
  changed_by      uuid references auth.users(id),
  changed_at      timestamptz not null default now()
);

create unique index if not exists playbook_versions_per_playbook_uniq
  on public.playbook_versions (playbook_id, version_number)
  where playbook_id is not null;

create index if not exists playbook_versions_playbook_idx
  on public.playbook_versions (playbook_id, changed_at desc);

create or replace function public.playbooks_write_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
  v_next_version int;
begin
  -- Skip no-op updates so save-without-edit clicks don't bloat history.
  if TG_OP = 'UPDATE' then
    v_old_snapshot := jsonb_build_object(
      'title',       OLD.title,
      'category_id', OLD.category_id,
      'excerpt',     OLD.excerpt,
      'body_md',     OLD.body_md
    );
    v_new_snapshot := jsonb_build_object(
      'title',       NEW.title,
      'category_id', NEW.category_id,
      'excerpt',     NEW.excerpt,
      'body_md',     NEW.body_md
    );
    if v_old_snapshot is not distinct from v_new_snapshot then
      return null;
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_next_version
    from public.playbook_versions
    where playbook_id = NEW.id;

  insert into public.playbook_versions
    (playbook_id, version_number, title, category_id, excerpt, body_md, changed_by)
  values
    (NEW.id, v_next_version, NEW.title, NEW.category_id, NEW.excerpt, NEW.body_md, NEW.updated_by);

  return null;
end
$$;

drop trigger if exists playbooks_write_version on public.playbooks;
create trigger playbooks_write_version
  after insert or update on public.playbooks
  for each row
  execute function public.playbooks_write_version();

-- RLS — staff read, no DML (trigger writes via SECURITY DEFINER).
alter table public.playbook_versions enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'playbook_versions'
  loop
    execute format('drop policy if exists %I on public.playbook_versions', r.policyname);
  end loop;
end $$;

create policy "playbook_versions_select_staff" on public.playbook_versions
  for select to authenticated
  using (public.is_staff());

-- No insert/update/delete policies. authenticated role has no DML access;
-- the trigger writes rows directly via SECURITY DEFINER.

commit;
