-- 0048_task_review_log.sql
-- Immutable audit trail of committee review decisions on tasks
-- (maintenance_requests). Append-only, written ONLY by a SECURITY DEFINER
-- AFTER trigger that fires when review_status changes. Staff-readable.
-- Mirrors member_audit_log (0025/0026). Depends on 0005, 0046.

begin;

create table if not exists public.task_review_log (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.maintenance_requests(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  old_status text,
  new_status text,
  reason text
);

create index if not exists task_review_log_ticket_idx on public.task_review_log (ticket_id);

alter table public.task_review_log enable row level security;

-- Drop any existing policies before recreating (idempotent re-runs).
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'task_review_log'
  loop execute format('drop policy if exists %I on public.task_review_log', p.policyname); end loop;
end $$;

-- Staff can read the trail; nobody gets DML — only the trigger writes.
create policy task_review_log_select_staff on public.task_review_log
  for select using (public.is_staff());

create or replace function public.log_task_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.review_status is distinct from old.review_status then
    insert into public.task_review_log (ticket_id, changed_by, old_status, new_status, reason)
    values (new.id, auth.uid(), old.review_status, new.review_status, new.decline_reason);
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_requests_review_log on public.maintenance_requests;
create trigger maintenance_requests_review_log
  after update on public.maintenance_requests
  for each row execute function public.log_task_review();

commit;
