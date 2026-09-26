-- 0083_closures.sql
--
-- "We're not meeting today" closures. When the church skips a Sunday or
-- Wednesday meeting (Wiffleball Weekend, Lake Day, snow day, ...), a sign on
-- the door carries a permanent QR code pointing at the public /not-here page,
-- which renders the currently active closure.
--
-- Two tables:
--   closure_reasons — reusable templates (title + body) for the recurring
--                     reasons. Picking one in the admin UI copies its content
--                     into the closure, so later template edits never rewrite
--                     an announcement already on the door.
--   closures        — one row per closure event (a log, so history is kept).
--                     "Open" = cleared_at is null and deleted_at is null; a
--                     partial unique index allows at most one open closure.
--                     "Active today" additionally requires
--                     starts_on <= church-local today <= coalesce(ends_on, inf)
--                     and is evaluated at request time in app code
--                     (lib/closures/data.ts) — auto-expiry needs no cron.
--
-- RLS: closures carries this app's first anon SELECT policy — the /not-here
-- page must work signed-out. Only open rows are anon-visible, and the content
-- is public by design (it is literally the poster on the front door). The
-- anon policy must not call is_staff()/is_super_admin(): those helpers are
-- granted to authenticated only.
--
-- Management is any building-committee member (is_staff) by explicit product
-- decision — NOT the can_edit_settings grant from 0057. Whether the church is
-- meeting is an operational call every committee member should be able to
-- make, unlike the reference-data settings the grant protects.
--
-- Depends on 0001 (set_updated_at, is_staff, is_super_admin).

begin;

-- ── Reason templates ─────────────────────────────────────────────
create table if not exists public.closure_reasons (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body_md     text not null default '',
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

drop trigger if exists closure_reasons_updated_at on public.closure_reasons;
create trigger closure_reasons_updated_at
  before update on public.closure_reasons
  for each row execute function public.set_updated_at();

-- ── Closure log ──────────────────────────────────────────────────
create table if not exists public.closures (
  id          uuid primary key default gen_random_uuid(),
  reason_id   uuid references public.closure_reasons(id) on delete set null,
  title       text not null,
  body_md     text not null default '',
  -- Date-only, church-local (see lib/dates/today.ts): the default must match
  -- churchToday(), not the server's UTC day.
  starts_on   date not null default (now() at time zone 'America/Chicago')::date,
  ends_on     date,          -- inclusive "closed through"; null = until cleared
  cleared_at  timestamptz,   -- manual "we're meeting again"
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint closures_dates_ok check (ends_on is null or ends_on >= starts_on)
);

-- At most one open closure at a time (also closes the double-start race —
-- the server action maps this violation to a friendly error).
create unique index if not exists closures_one_open_idx
  on public.closures ((true))
  where cleared_at is null and deleted_at is null;

-- Authorship stamping, same rationale as playbooks (0029): a BEFORE trigger
-- forces created_by/updated_by to auth.uid() so clients cannot spoof them.
create or replace function public.closures_set_audit_fields()
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
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists closures_set_audit_fields on public.closures;
create trigger closures_set_audit_fields
  before insert or update on public.closures
  for each row execute function public.closures_set_audit_fields();

-- ── RLS ──────────────────────────────────────────────────────────
alter table public.closure_reasons enable row level security;
alter table public.closures enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('closure_reasons', 'closures')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Templates: portal-only (the public page never needs them — content is
-- copied onto the closure row).
create policy "closure_reasons_select_authenticated" on public.closure_reasons
  for select to authenticated
  using (deleted_at is null);

create policy "closure_reasons_select_deleted_super" on public.closure_reasons
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "closure_reasons_insert_staff" on public.closure_reasons
  for insert to authenticated
  with check (public.is_staff());

create policy "closure_reasons_update_staff" on public.closure_reasons
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "closure_reasons_delete_super" on public.closure_reasons
  for delete to authenticated
  using (public.is_super_admin());

-- Closures: anon sees the open one (door-poster public); cleared history and
-- deleted rows stay portal-only.
create policy "closures_select_anon_open" on public.closures
  for select to anon
  using (cleared_at is null and deleted_at is null);

create policy "closures_select_authenticated" on public.closures
  for select to authenticated
  using (deleted_at is null);

create policy "closures_select_deleted_super" on public.closures
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "closures_insert_staff" on public.closures
  for insert to authenticated
  with check (public.is_staff());

create policy "closures_update_staff" on public.closures
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "closures_delete_super" on public.closures
  for delete to authenticated
  using (public.is_super_admin());

-- Supabase grants table privileges to anon via default privileges, but be
-- explicit: the anon SELECT policy is useless without the grant.
grant select on public.closures to anon;

-- ── Seed the recurring reasons (idempotent by title) ─────────────
insert into public.closure_reasons (title, body_md, sort_order)
select v.title, v.body_md, v.sort_order
from (values
  ('Wiffleball Weekend',
   'We''re away at **Wiffleball Weekend**! We''ll be back for our next regular meeting — we''d love to see you then.',
   10),
  ('Lake Day',
   'The church family is spending the day together at the lake. We''ll be back for our next regular meeting.',
   20),
  ('Snow Day',
   'Due to winter weather, we''re not meeting today for everyone''s safety. Stay warm and stay safe!',
   30)
) as v(title, body_md, sort_order)
where not exists (
  select 1 from public.closure_reasons r where r.title = v.title
);

commit;
