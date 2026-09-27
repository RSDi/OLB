-- 0025_member_audit_log.sql
--
-- Append-only audit log for members. AFTER trigger captures INSERT, UPDATE,
-- DELETE as JSONB diffs. The 0021 column-restriction trigger fires BEFORE
-- the row is written, so any rejected change aborts the transaction and no
-- audit row is created — the log only contains changes that actually
-- happened.
--
-- member_id is ON DELETE SET NULL so the log survives a hard-delete of the
-- member (the cascade would otherwise wipe the very row that records the
-- delete). old_data jsonb still contains the member's full identity.
--
-- Depends on 0001 (is_staff), 0017 (members.phone/birthday columns),
-- 0022 (the columns we'll capture via to_jsonb(...)).

begin;

create table if not exists public.member_audit_log (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references public.members(id) on delete set null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  action     text not null,
  old_data   jsonb,
  new_data   jsonb,
  constraint member_audit_log_action_check
    check (action in ('insert', 'update', 'delete'))
);

create index if not exists member_audit_log_member_idx
  on public.member_audit_log (member_id, changed_at desc);

create index if not exists member_audit_log_changed_at_idx
  on public.member_audit_log (changed_at desc);

-- AFTER trigger so we capture the post-image (NEW after BEFORE triggers).
create or replace function public.members_write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_member_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    v_member_id := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_member_id := NEW.id;
  elsif TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_member_id := OLD.id;
  end if;

  -- Skip no-op updates (every column identical). Postgres still fires the
  -- trigger when an UPDATE didn't actually change anything; without this
  -- guard we'd log noise from save-without-edit clicks.
  if TG_OP = 'UPDATE' and v_old is not distinct from v_new then
    return null;
  end if;

  insert into public.member_audit_log (member_id, changed_by, action, old_data, new_data)
  values (v_member_id, auth.uid(), lower(TG_OP), v_old, v_new);

  return null;
end
$$;

drop trigger if exists members_audit_after on public.members;
create trigger members_audit_after
  after insert or update or delete on public.members
  for each row
  execute function public.members_write_audit_log();

-- RLS — staff read, nobody writes directly (trigger only).
alter table public.member_audit_log enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'member_audit_log'
  loop
    execute format('drop policy if exists %I on public.member_audit_log', r.policyname);
  end loop;
end $$;

create policy "member_audit_log_select_staff" on public.member_audit_log
  for select to authenticated
  using (public.is_staff());

-- No insert/update/delete policies. authenticated role has no DML access;
-- the trigger runs as SECURITY DEFINER so it bypasses RLS to write rows.

commit;
