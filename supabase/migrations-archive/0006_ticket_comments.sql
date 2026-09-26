-- 0006_ticket_comments.sql
--
-- Comment thread on a maintenance request. The ticket submitter and staff
-- can both read and post; nobody but the super-admin can delete (matches
-- the soft-delete-everywhere rule).
--
-- Phase 1 UI is append-only. The deleted_at column is present so the
-- super-admin can hide comments via SQL if needed; no UI edit/delete yet.
--
-- Depends on 0001 (is_staff, is_super_admin), 0005 (maintenance_requests).

begin;

create table if not exists public.ticket_comments (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.maintenance_requests(id) on delete cascade,
  author_id  uuid not null references public.members(id),
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists ticket_comments_ticket_idx
  on public.ticket_comments (ticket_id, created_at)
  where deleted_at is null;

drop trigger if exists ticket_comments_set_updated_at
  on public.ticket_comments;

create trigger ticket_comments_set_updated_at
  before update on public.ticket_comments
  for each row execute function public.set_updated_at();

-- RLS
alter table public.ticket_comments enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ticket_comments'
  loop
    execute format('drop policy if exists %I on public.ticket_comments', r.policyname);
  end loop;
end $$;

-- Anyone who can see the parent ticket can read its comments. Staff sees
-- all non-deleted; super-admin also sees deleted. The "see parent ticket"
-- check piggybacks on the parent's RLS by asking: does a row exist that
-- this caller is allowed to select?
create policy "ticket_comments_select" on public.ticket_comments
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.maintenance_requests mr
      where mr.id = ticket_comments.ticket_id
        and mr.deleted_at is null
        and (mr.submitted_by = auth.uid() or public.is_staff())
    )
  );

create policy "ticket_comments_select_deleted_super" on public.ticket_comments
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

-- INSERT: ticket submitter or staff can post. author_id must equal the
-- caller's own members.id row to prevent impersonation.
create policy "ticket_comments_insert" on public.ticket_comments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.maintenance_requests mr
      where mr.id = ticket_comments.ticket_id
        and mr.deleted_at is null
        and (mr.submitted_by = auth.uid() or public.is_staff())
    )
    and exists (
      select 1 from public.members m
      where m.id = ticket_comments.author_id and m.user_id = auth.uid()
    )
  );

-- UPDATE / DELETE: super-admin only. No edit UI in Phase 1.
create policy "ticket_comments_update_super" on public.ticket_comments
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "ticket_comments_delete_super" on public.ticket_comments
  for delete to authenticated
  using (public.is_super_admin());

commit;
