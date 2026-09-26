-- 0037_contacts.sql
--
-- Vendors / external contacts directory. Lives parallel to `members`
-- (which is the church member directory). Where members are people in the
-- congregation, contacts are the external folks the facilities team works
-- with: plumbers, suppliers, contractors, insurance agents, utilities.
--
-- Schema:
--   contact_categories  — admin-managed lookup (Plumbing, Electrical, etc.)
--   contacts            — companies + people (self-ref via parent_contact_id)
--   contact_links       — polymorphic join from contacts to other entities
--                         (maintenance tickets, PM assets, playbooks/docs)
--
-- Visibility: staff + super_admin only. Regular members never see vendor
-- data. RLS enforces this on every table.
--
-- Depends on 0001 (is_staff, is_super_admin, set_updated_at).

begin;

-- ---------------------------------------------------------------------------
-- 1. contact_categories — admin-managed list, same shape as
--    playbook_categories (0028) and event_categories (0015).
-- ---------------------------------------------------------------------------

create table if not exists public.contact_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text,
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists contact_categories_name_active_uniq
  on public.contact_categories (lower(name))
  where deleted_at is null;

create index if not exists contact_categories_sort_idx
  on public.contact_categories (sort_order, name)
  where deleted_at is null;

drop trigger if exists contact_categories_set_updated_at on public.contact_categories;
create trigger contact_categories_set_updated_at
  before update on public.contact_categories
  for each row execute function public.set_updated_at();

-- Seed the starter categories. Idempotent — skips any name already present.
insert into public.contact_categories (name, slug, sort_order)
select * from (values
  ('Plumbing',          'plumbing',          10),
  ('Electrical',        'electrical',        20),
  ('HVAC',              'hvac',              30),
  ('IT',                'it',                40),
  ('Office Supplies',   'office-supplies',   50),
  ('Contractor',        'contractor',        60),
  ('Service Provider',  'service-provider',  70),
  ('Utility',           'utility',           80),
  ('Insurance',         'insurance',         90),
  ('Legal',             'legal',            100),
  ('Other',             'other',            110)
) as src(name, slug, sort_order)
where not exists (
  select 1 from public.contact_categories cc
  where lower(cc.name) = lower(src.name) and cc.deleted_at is null
);

alter table public.contact_categories enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'contact_categories'
  loop
    execute format('drop policy if exists %I on public.contact_categories', r.policyname);
  end loop;
end $$;

create policy "contact_categories_select_staff" on public.contact_categories
  for select to authenticated
  using (public.is_staff());

create policy "contact_categories_insert_staff" on public.contact_categories
  for insert to authenticated
  with check (public.is_staff());

create policy "contact_categories_update_staff" on public.contact_categories
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff() and deleted_at is null);

create policy "contact_categories_update_super" on public.contact_categories
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "contact_categories_delete_super" on public.contact_categories
  for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 2. contacts — companies + people.
--
-- `kind` distinguishes a vendor company from an individual (sales rep,
-- account manager) who works at that company. Persons hang off their
-- company via parent_contact_id; companies have parent_contact_id = null.
-- ---------------------------------------------------------------------------

create table if not exists public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null,
  parent_contact_id   uuid references public.contacts(id) on delete set null,
  category_id         uuid references public.contact_categories(id) on delete set null,

  -- Identity
  name                text not null,
  nickname            text,

  -- Reach
  email               text,
  phone               text,
  mobile_phone        text,
  website             text,
  address             text,

  -- Account / billing
  account_number      text,
  customer_id         text,
  payment_terms       text,
  tax_id              text,

  -- Notes (three labeled fields per the plan)
  notes               text,
  reorder_notes       text,
  quote_contact_notes text,

  -- Tags — flexible labels (preferred, emergency, retired, etc.)
  tags                text[] not null default '{}',

  -- Bookkeeping
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id),
  deleted_at          timestamptz,

  constraint contacts_kind_check check (kind in ('company','person')),
  constraint contacts_no_self_parent check (parent_contact_id is null or parent_contact_id <> id)
);

create index if not exists contacts_kind_idx
  on public.contacts (kind)
  where deleted_at is null;

create index if not exists contacts_category_idx
  on public.contacts (category_id)
  where deleted_at is null;

create index if not exists contacts_parent_idx
  on public.contacts (parent_contact_id)
  where deleted_at is null and parent_contact_id is not null;

create index if not exists contacts_name_idx
  on public.contacts (lower(name))
  where deleted_at is null;

create index if not exists contacts_tags_gin
  on public.contacts using gin (tags)
  where deleted_at is null;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'contacts'
  loop
    execute format('drop policy if exists %I on public.contacts', r.policyname);
  end loop;
end $$;

create policy "contacts_select_staff" on public.contacts
  for select to authenticated
  using (public.is_staff());

create policy "contacts_select_deleted_super" on public.contacts
  for select to authenticated
  using (deleted_at is not null and public.is_super_admin());

create policy "contacts_insert_staff" on public.contacts
  for insert to authenticated
  with check (public.is_staff());

create policy "contacts_update_staff" on public.contacts
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff());

-- Super-admin can update soft-deleted rows (to restore them).
create policy "contacts_update_super" on public.contacts
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "contacts_delete_super" on public.contacts
  for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 3. contact_links — polymorphic join from contacts to other entities.
--
-- entity_type values used today:
--   'maintenance_ticket'  → maintenance_requests.id
--   'pm_asset'            → assets.id
--   'playbook'            → playbooks.id
--
-- New entity types can be added without a schema change — just start
-- writing rows with the new entity_type string and add a fetch path.
--
-- `role` is freeform context for the link (e.g. "supplier", "installer",
-- "quote_only", "emergency"). NULL is allowed when no role distinction
-- matters.
-- ---------------------------------------------------------------------------

create table if not exists public.contact_links (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  role         text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),

  constraint contact_links_entity_type_check
    check (entity_type in ('maintenance_ticket','pm_asset','playbook'))
);

create unique index if not exists contact_links_unique
  on public.contact_links (contact_id, entity_type, entity_id, coalesce(role, ''));

create index if not exists contact_links_entity_idx
  on public.contact_links (entity_type, entity_id);

create index if not exists contact_links_contact_idx
  on public.contact_links (contact_id);

alter table public.contact_links enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'contact_links'
  loop
    execute format('drop policy if exists %I on public.contact_links', r.policyname);
  end loop;
end $$;

create policy "contact_links_select_staff" on public.contact_links
  for select to authenticated
  using (public.is_staff());

create policy "contact_links_insert_staff" on public.contact_links
  for insert to authenticated
  with check (public.is_staff());

create policy "contact_links_delete_staff" on public.contact_links
  for delete to authenticated
  using (public.is_staff());

commit;
