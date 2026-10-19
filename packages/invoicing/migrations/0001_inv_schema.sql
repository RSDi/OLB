-- Invoicing module schema (portable). Tables use the inv_ prefix and hold
-- only opaque host ids (event, customer, user) as text — no foreign keys to
-- host tables. A host copies this into its own migrations, then implements
-- inv_can_invoice() / inv_can_view_invoices() in a follow-up (OLB: 0152).
--
-- Until those helpers exist, the stubs below return false so a half-applied
-- schema stays closed. Hosts REPLACE them.
-- Do not re-apply this file after the host overlay (OLB: 0152): it would
-- replace inv_can_invoice() / inv_can_view_invoices() with these stubs.

create table if not exists public.inv_invoices (
  id               uuid primary key default gen_random_uuid(),
  number           text not null unique,
  host_event_id    text,
  host_customer_id text,
  customer_name    text not null,
  customer_email   text,
  event_label      text,
  issued_on        date,
  due_on           date not null,
  deposit_cents    int not null default 0 check (deposit_cents >= 0),
  deposit_due_on   date,
  sent_at          timestamptz,
  viewed_at        timestamptz,
  voided_at        timestamptz,
  public_token     uuid not null unique default gen_random_uuid(),
  created_by       text,
  cc_emails        text[],
  bcc_emails       text[],
  reminder_freq    text check (reminder_freq is null or reminder_freq in ('off', '3d', 'weekly', '2w')),
  reminder_start_days int check (reminder_start_days is null or reminder_start_days in (3, 5, 7, 14)),
  reminder_until_paid boolean,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists inv_invoices_event_idx on public.inv_invoices (host_event_id);
create index if not exists inv_invoices_customer_idx on public.inv_invoices (host_customer_id);
create index if not exists inv_invoices_sent_idx on public.inv_invoices (sent_at);

create table if not exists public.inv_line_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.inv_invoices(id) on delete cascade,
  description  text not null,
  qty          int not null default 1 check (qty >= 0),
  unit_cents   int not null default 0 check (unit_cents >= 0),
  sort_order   int not null default 0
);

create index if not exists inv_line_items_invoice_idx on public.inv_line_items (invoice_id);

create table if not exists public.inv_payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.inv_invoices(id) on delete cascade,
  method       text not null check (method in ('venmo', 'check')),
  amount_cents int not null check (amount_cents > 0),
  paid_on      date not null,
  reference    text,
  recorded_by  text,
  created_at   timestamptz not null default now()
);

create index if not exists inv_payments_invoice_idx on public.inv_payments (invoice_id);

create table if not exists public.inv_reminder_settings (
  id          int primary key check (id = 1),
  freq        text not null default '3d' check (freq in ('off', '3d', 'weekly', '2w')),
  start_days  int not null default 7 check (start_days in (3, 5, 7, 14)),
  until_paid  boolean not null default true,
  cc_emails   text[] not null default '{}',
  bcc_emails  text[] not null default '{}',
  updated_by  text,
  updated_at  timestamptz not null default now()
);

insert into public.inv_reminder_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.inv_reminder_sends (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.inv_invoices(id) on delete cascade,
  sent_on     date not null,
  status      text not null default 'sent' check (status in ('sending', 'sent', 'failed')),
  error       text,
  created_at  timestamptz not null default now(),
  unique (invoice_id, sent_on)
);

create table if not exists public.inv_sequences (
  year   int primary key,
  last_n int not null default 0
);

create or replace function public.inv_next_number(p_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not coalesce(public.inv_can_invoice(), false) then
    raise exception 'forbidden';
  end if;
  insert into public.inv_sequences (year, last_n) values (p_year, 1)
  on conflict (year) do update set last_n = public.inv_sequences.last_n + 1
  returning last_n into n;
  return 'INV-' || p_year || '-' || lpad(n::text, 4, '0');
end
$$;

-- Closed stubs. Hosts replace these with their permission checks.
create or replace function public.inv_can_invoice()
returns boolean language sql stable security definer set search_path = public
as $$ select false $$;

create or replace function public.inv_can_view_invoices()
returns boolean language sql stable security definer set search_path = public
as $$ select public.inv_can_invoice() $$;

alter table public.inv_invoices enable row level security;
alter table public.inv_line_items enable row level security;
alter table public.inv_payments enable row level security;
alter table public.inv_reminder_settings enable row level security;
alter table public.inv_reminder_sends enable row level security;
alter table public.inv_sequences enable row level security;

drop policy if exists "inv_invoices_select" on public.inv_invoices;
create policy "inv_invoices_select" on public.inv_invoices
  for select to authenticated
  using ((select public.inv_can_view_invoices()));

drop policy if exists "inv_invoices_write" on public.inv_invoices;
create policy "inv_invoices_write" on public.inv_invoices
  for all to authenticated
  using ((select public.inv_can_invoice()))
  with check ((select public.inv_can_invoice()));

drop policy if exists "inv_line_items_select" on public.inv_line_items;
create policy "inv_line_items_select" on public.inv_line_items
  for select to authenticated
  using ((select public.inv_can_view_invoices()));

drop policy if exists "inv_line_items_write" on public.inv_line_items;
create policy "inv_line_items_write" on public.inv_line_items
  for all to authenticated
  using ((select public.inv_can_invoice()))
  with check ((select public.inv_can_invoice()));

drop policy if exists "inv_payments_select" on public.inv_payments;
create policy "inv_payments_select" on public.inv_payments
  for select to authenticated
  using ((select public.inv_can_view_invoices()));

drop policy if exists "inv_payments_write" on public.inv_payments;
create policy "inv_payments_write" on public.inv_payments
  for all to authenticated
  using ((select public.inv_can_invoice()))
  with check ((select public.inv_can_invoice()));

drop policy if exists "inv_reminder_settings_select" on public.inv_reminder_settings;
create policy "inv_reminder_settings_select" on public.inv_reminder_settings
  for select to authenticated
  using ((select public.inv_can_view_invoices()));

drop policy if exists "inv_reminder_settings_write" on public.inv_reminder_settings;
create policy "inv_reminder_settings_write" on public.inv_reminder_settings
  for all to authenticated
  using ((select public.inv_can_invoice()))
  with check ((select public.inv_can_invoice()));

drop policy if exists "inv_reminder_sends_select" on public.inv_reminder_sends;
create policy "inv_reminder_sends_select" on public.inv_reminder_sends
  for select to authenticated
  using ((select public.inv_can_view_invoices()));

drop policy if exists "inv_reminder_sends_write" on public.inv_reminder_sends;
create policy "inv_reminder_sends_write" on public.inv_reminder_sends
  for all to authenticated
  using ((select public.inv_can_invoice()))
  with check ((select public.inv_can_invoice()));

-- Sequences are only bumped via inv_next_number (security definer).
drop policy if exists "inv_sequences_select" on public.inv_sequences;
create policy "inv_sequences_select" on public.inv_sequences
  for select to authenticated
  using ((select public.inv_can_invoice()));

revoke all on function public.inv_next_number(int) from public, anon;
grant execute on function public.inv_next_number(int) to authenticated, service_role;
revoke all on function public.inv_can_invoice() from public, anon;
grant execute on function public.inv_can_invoice() to authenticated, service_role;
revoke all on function public.inv_can_view_invoices() from public, anon;
grant execute on function public.inv_can_view_invoices() to authenticated, service_role;
