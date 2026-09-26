-- 0017_member_fields_and_relationships.sql
--
-- Extends the members table for the church directory use case:
--   - phone + birthday demographic fields
--   - relax NOT NULL on user_id (so super-admins can pre-create members who
--     haven't signed up yet — they get linked on first signin via the
--     resolve-membership flow)
--   - relax NOT NULL on email (so directory-only family entries can be
--     created without an email; they never sign in)
--
-- And introduces member_relationships for spouse / parent / child links.
-- Convention: each link is stored bidirectionally on save so queries from
-- either side are a simple WHERE member_id = X.
--
-- Depends on 0001 (is_staff, is_super_admin).

begin;

-- 1. New demographic columns.
alter table public.members
  add column if not exists phone    text,
  add column if not exists birthday date;

-- 2. Relax NOT NULL so super-admins can pre-create rows. Existing rows
--    aren't affected (the constraint just no longer rejects new NULLs).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members'
      and column_name = 'user_id' and is_nullable = 'NO'
  ) then
    alter table public.members alter column user_id drop not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members'
      and column_name = 'email' and is_nullable = 'NO'
  ) then
    alter table public.members alter column email drop not null;
  end if;
end $$;

-- A partial unique index on email lets us still enforce "no duplicate
-- portal accounts for the same email" without blocking directory-only
-- members from sharing NULL email.
create unique index if not exists members_email_active_uniq
  on public.members (lower(email))
  where email is not null;

-- 3. Relationships table.
create table if not exists public.member_relationships (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null references public.members(id) on delete cascade,
  related_member_id   uuid not null references public.members(id) on delete cascade,
  relationship        text not null,
  created_at          timestamptz not null default now(),
  constraint member_relationships_relationship_check
    check (relationship in ('spouse','parent','child')),
  constraint member_relationships_no_self
    check (member_id <> related_member_id),
  constraint member_relationships_unique
    unique (member_id, related_member_id, relationship)
);

create index if not exists member_relationships_member_idx
  on public.member_relationships (member_id, relationship);
create index if not exists member_relationships_related_idx
  on public.member_relationships (related_member_id, relationship);

-- RLS — staff read all, super-admin write. (Approved-member directory
-- access comes later via either a directory page or a permissive read
-- policy; leave it staff-only for now so we don't expose birthdays/phones
-- unintentionally before the UI lands.)
alter table public.member_relationships enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'member_relationships'
  loop
    execute format('drop policy if exists %I on public.member_relationships', r.policyname);
  end loop;
end $$;

create policy "member_relationships_select_staff" on public.member_relationships
  for select to authenticated
  using (public.is_staff());

create policy "member_relationships_insert_super" on public.member_relationships
  for insert to authenticated
  with check (public.is_super_admin());

create policy "member_relationships_delete_super" on public.member_relationships
  for delete to authenticated
  using (public.is_super_admin());

commit;
