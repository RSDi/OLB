-- 0029_playbooks.sql
--
-- Playbooks (operations docs) — full content lives in body_md as markdown.
-- The previous version was a hardcoded array on /portal/docs; this promotes
-- it to a real table backed by RLS.
--
-- Authorship is tracked directly on the row (created_by / updated_by) so
-- the listing page can show "Updated <date> · <author>" without joining the
-- versions table. Per-edit history is captured separately in
-- playbook_versions (0030) via an AFTER trigger.
--
-- created_by / updated_by are populated by a BEFORE trigger that forces
-- the value to auth.uid() — clients cannot spoof authorship even if they
-- write through the REST API directly.
--
-- RLS: any authenticated user reads non-deleted rows (playbooks are not
-- sensitive — meant to be widely available within the portal). Staff
-- create + edit. Super-admin soft + hard delete.
--
-- Depends on 0001 (helpers), 0028 (playbook_categories).

begin;

create table if not exists public.playbooks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category_id   uuid references public.playbook_categories(id) on delete set null,
  excerpt       text,
  body_md       text not null default '',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists playbooks_category_active_idx
  on public.playbooks (category_id)
  where deleted_at is null;

create index if not exists playbooks_updated_active_idx
  on public.playbooks (updated_at desc)
  where deleted_at is null;

-- BEFORE trigger that stamps authorship + updated_at on every write.
-- Forces created_by/updated_by to auth.uid() so the value cannot be spoofed
-- by a client even though the column itself is writable via RLS.
create or replace function public.playbooks_set_audit_fields()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
  elsif TG_OP = 'UPDATE' then
    -- Preserve original creator; refresh updater + timestamp.
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists playbooks_set_audit_fields on public.playbooks;
create trigger playbooks_set_audit_fields
  before insert or update on public.playbooks
  for each row execute function public.playbooks_set_audit_fields();

-- RLS
alter table public.playbooks enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'playbooks'
  loop
    execute format('drop policy if exists %I on public.playbooks', r.policyname);
  end loop;
end $$;

create policy "playbooks_select_authenticated" on public.playbooks
  for select to authenticated
  using (deleted_at is null);

create policy "playbooks_select_deleted_super" on public.playbooks
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "playbooks_insert_staff" on public.playbooks
  for insert to authenticated
  with check (public.is_staff());

create policy "playbooks_update_staff" on public.playbooks
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "playbooks_update_super" on public.playbooks
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "playbooks_delete_super" on public.playbooks
  for delete to authenticated
  using (public.is_super_admin());

commit;
