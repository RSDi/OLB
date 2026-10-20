-- 0157_inv_gmail.sql
--
-- Club Gmail sender for invoicing. One encrypted refresh token per org
-- (OLB is a single club: singleton row id = true). The AES-GCM key is
-- INVOICE_GMAIL_TOKEN_KEY in Vercel, never in this table. No grant to
-- authenticated: the app uses the service role after a super_admin
-- check for connect/disconnect (same pattern as game_film_youtube).
-- Whoever can invoice still sends through the connected account.
--
-- Apply with supabase db push, after 0156 (Data API grants). Idempotent.
-- Additive: create-if-not-exists, insert-on-conflict, add-column-if-not-exists.
-- Safe on existing data.

begin;

create table if not exists public.inv_gmail (
  id                 boolean primary key default true check (id),
  refresh_token_enc  text,
  sender_email       text,
  connected_at       timestamptz,
  connected_by       uuid references auth.users (id) on delete set null,
  last_used_at       timestamptz,
  last_error         text,
  updated_at         timestamptz not null default now()
);

insert into public.inv_gmail (id) values (true)
on conflict (id) do nothing;

alter table public.inv_gmail add column if not exists refresh_token_enc text;
alter table public.inv_gmail add column if not exists sender_email text;
alter table public.inv_gmail add column if not exists connected_at timestamptz;
alter table public.inv_gmail add column if not exists connected_by uuid;
alter table public.inv_gmail add column if not exists last_used_at timestamptz;
alter table public.inv_gmail add column if not exists last_error text;
alter table public.inv_gmail add column if not exists updated_at timestamptz;

alter table public.inv_gmail enable row level security;

revoke all on table public.inv_gmail from public, anon, authenticated;
grant select, insert, update, delete on public.inv_gmail to service_role;

commit;
