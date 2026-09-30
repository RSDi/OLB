-- 0109_contact_history_and_coaches.sql
--
-- External Contacts opens to the coaches, read-only, and keeps every change.
--
--   contact_categories.shared_with_coaches
--       Settings → Contact Types → "Coaches can see". Coaches (is_coach(),
--       0108) read the contacts of those types: a company of that type, and
--       the people at it who have no type of their own (a person's own type
--       decides when they have one). Turned on here, once, for the types the
--       HS planning spreadsheet's contacts go in (Programs, Facilities,
--       Referees and the names the import treats as the same,
--       lib/hs-planning-import/plan.ts); the import turns it on for the
--       Programs and Referees types it adds. Coaches can't add, edit or
--       delete a contact (no new write policies), and see everything on the
--       ones they can read.
--
--   contact_versions
--       Every change to a contact, with who made it: added, edited, moved to
--       the deleted bin or brought back, the fields that changed (before and
--       after) and the whole contact as it stood afterwards, which "Restore
--       this version" puts back. Written by a trigger, so no save can skip
--       it. Only the board reads it, and nobody can edit or delete it (no
--       insert, update or delete policies). A change made by the spreadsheet
--       import or by "Restore this version" says so: the app sends the
--       x-change-source request header, which PostgREST hands the trigger.
--       Contacts saved before this migration start their history at what
--       they hold now.
--
-- Apply via the Supabase SQL editor, after 0108. Idempotent.

begin;

-- ─── Types coaches can see ──────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contact_categories'
      and column_name = 'shared_with_coaches'
  ) then
    alter table public.contact_categories
      add column shared_with_coaches boolean not null default false;
    -- Only when the column is new, so running this again never undoes what
    -- the board has set since.
    update public.contact_categories
       set shared_with_coaches = true
     where deleted_at is null
       and lower(trim(name)) in (
         'programs', 'program', 'opponents', 'opponent', 'other programs', 'teams', 'schools',
         'facilities', 'facility', 'gyms', 'venues', 'gym rentals',
         'referees', 'referee', 'officials', 'refs'
       );
  end if;
end;
$$;

-- Can coaches see this contact? Its own type decides; a person with no type
-- follows their company's. Security definer so the policy below can read the
-- company without going through contacts' policies again.
create or replace function public.contact_shared_with_coaches(p_category_id uuid, p_parent_contact_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select cc.shared_with_coaches
       from public.contact_categories cc
      where cc.id = p_category_id
        and cc.deleted_at is null),
    (select cc.shared_with_coaches
       from public.contacts p
       join public.contact_categories cc on cc.id = p.category_id and cc.deleted_at is null
      where p.id = p_parent_contact_id
        and p.deleted_at is null),
    false
  )
$$;

revoke all on function public.contact_shared_with_coaches(uuid, uuid) from public, anon;
grant execute on function public.contact_shared_with_coaches(uuid, uuid) to authenticated;

-- The helper takes the row's columns, so it can't be wrapped in (select …);
-- is_coach() is, and runs once per query.
drop policy if exists "contacts_select_coach" on public.contacts;
create policy "contacts_select_coach" on public.contacts
  for select to authenticated
  using (
    deleted_at is null
    and (select public.is_coach())
    and public.contact_shared_with_coaches(category_id, parent_contact_id)
  );

drop policy if exists "contact_categories_select_coach" on public.contact_categories;
create policy "contact_categories_select_coach" on public.contact_categories
  for select to authenticated
  using (
    deleted_at is null
    and shared_with_coaches
    and (select public.is_coach())
  );

-- ─── History ────────────────────────────────────────────────────────────────

create table if not exists public.contact_versions (
  id                   uuid primary key default gen_random_uuid(),
  contact_id           uuid not null references public.contacts(id) on delete cascade,
  -- created, edited, deleted (to the deleted bin), undeleted (brought back),
  -- or start: the contact as it stood when its history began (this
  -- migration), last saved at changed_at.
  action               text not null
                       check (action in ('start', 'created', 'edited', 'deleted', 'undeleted')),
  -- What changed, { column: [before, after] }. Empty for start and created.
  changes              jsonb not null default '{}'::jsonb,
  -- The whole contact afterwards.
  snapshot             jsonb not null,
  -- app, import (Import spreadsheet) or restore (Restore this version).
  source               text not null default 'app'
                       check (source in ('app', 'import', 'restore')),
  changed_by           uuid references auth.users(id) on delete set null,
  -- The super-admin behind a change made during a "Preview as" (0099).
  impersonator_user_id uuid,
  changed_at           timestamptz not null default now()
);

create index if not exists contact_versions_contact_idx
  on public.contact_versions (contact_id, changed_at desc);

create index if not exists contact_versions_changed_at_idx
  on public.contact_versions (changed_at desc);

create or replace function public.contacts_write_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new     jsonb := to_jsonb(new) - 'updated_at';
  v_old     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_action  text := 'created';
  v_source  text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old) - 'updated_at';
    -- A save that changed nothing isn't a change.
    if v_new = v_old then
      return null;
    end if;
    for v_key in select jsonb_object_keys(v_new) loop
      if (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
      end if;
    end loop;
    v_action := case
      when old.deleted_at is null and new.deleted_at is not null then 'deleted'
      when old.deleted_at is not null and new.deleted_at is null then 'undeleted'
      else 'edited'
    end;
  end if;

  -- Set by the app for the spreadsheet import and for restoring a version.
  -- Outside PostgREST (the SQL editor) there are no request headers.
  begin
    v_source := nullif(current_setting('request.headers', true), '')::json ->> 'x-change-source';
  exception when others then
    v_source := null;
  end;
  if v_source is null or v_source not in ('import', 'restore') then
    v_source := 'app';
  end if;

  insert into public.contact_versions
    (contact_id, action, changes, snapshot, source, changed_by, impersonator_user_id)
  values
    (new.id, v_action, v_changes, to_jsonb(new), v_source, auth.uid(), public.current_preview_impersonator());
  return null;
end;
$$;

drop trigger if exists contacts_write_version on public.contacts;
create trigger contacts_write_version
  after insert or update on public.contacts
  for each row execute function public.contacts_write_version();

alter table public.contact_versions enable row level security;

drop policy if exists "contact_versions_select_staff" on public.contact_versions;
create policy "contact_versions_select_staff" on public.contact_versions
  for select to authenticated
  using ((select public.is_staff()));

revoke all on public.contact_versions from anon;

-- Contacts saved before this migration start their history at what they
-- hold now.
insert into public.contact_versions (contact_id, action, snapshot, changed_at)
select c.id, 'start', to_jsonb(c), c.updated_at
from public.contacts c
where not exists (select 1 from public.contact_versions v where v.contact_id = c.id);

commit;

notify pgrst, 'reload schema';
