-- 0049_security_hardening.sql
--
-- Track 2 (code & security review) fixes, 2026-06-11:
--
-- 1. Role helpers ignore soft-delete: is_staff()/is_super_admin()/is_approved()
--    read the caller's members row without checking deleted_at, so a
--    soft-deleted admin keeps full staff powers at the RLS layer. Redefine all
--    three to require a live (deleted_at is null) row.
--
-- 2. Pending-member exposure: events, playbooks, and the three category
--    tables grant SELECT `to authenticated` with no approval check. Signups
--    are open, so anyone who registers (status=pending or even denied) can
--    read the church calendar and all operations playbooks by calling
--    PostgREST directly — the portal UI redirect is app-side only. Gate these
--    reads to approved members (or staff).
--
-- 3. maintenance_requests INSERT still allows `anon` from the days when the
--    public assistance forms inserted client-side. Both public forms are gone
--    (maintenance redirects into the portal; building use goes through the
--    createPublicBuildingRequest server action, which uses the service-role
--    client and is unaffected by RLS). Tighten INSERT to approved members and
--    staff so a pending/denied signup — or anyone scripting the public anon
--    key — can no longer write rows into the queue.
--
-- Idempotent; safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Role helpers: require a live members row.
-- ---------------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role in ('admin','super_admin')
       from public.members
      where user_id = auth.uid()
        and deleted_at is null),
    false
  )
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin'
       from public.members
      where user_id = auth.uid()
        and deleted_at is null),
    false
  )
$$;

create or replace function public.is_approved()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select status = 'approved'
       from public.members
      where user_id = auth.uid()
        and deleted_at is null),
    false
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. Approved-member gates on portal content reads.
-- ---------------------------------------------------------------------------

drop policy if exists "events_select_authenticated" on public.events;
create policy "events_select_approved" on public.events
  for select to authenticated
  using (deleted_at is null and (public.is_approved() or public.is_staff()));

drop policy if exists "event_categories_select_active" on public.event_categories;
create policy "event_categories_select_approved" on public.event_categories
  for select to authenticated
  using (deleted_at is null and (public.is_approved() or public.is_staff()));

drop policy if exists "playbooks_select_authenticated" on public.playbooks;
create policy "playbooks_select_approved" on public.playbooks
  for select to authenticated
  using (deleted_at is null and (public.is_approved() or public.is_staff()));

drop policy if exists "playbook_categories_select_active" on public.playbook_categories;
create policy "playbook_categories_select_approved" on public.playbook_categories
  for select to authenticated
  using (deleted_at is null and (public.is_approved() or public.is_staff()));

drop policy if exists "task_categories_select_active" on public.task_categories;
create policy "task_categories_select_approved" on public.task_categories
  for select to authenticated
  using (deleted_at is null and (public.is_approved() or public.is_staff()));

-- ---------------------------------------------------------------------------
-- 3. Ticket INSERT: approved members and staff only (anon arm removed).
-- ---------------------------------------------------------------------------

drop policy if exists "maintenance_insert" on public.maintenance_requests;
create policy "maintenance_insert" on public.maintenance_requests
  for insert to authenticated
  with check (
    (submitted_by = auth.uid() and public.is_approved())
    or public.is_staff()
  );

commit;
