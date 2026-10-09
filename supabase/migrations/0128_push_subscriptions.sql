-- 0128_push_subscriptions.sql
--
-- Push notifications for the installed portal app (and any browser that
-- allows them). Each browser or device a member turns notifications on in
-- gets one row: the push service's endpoint and the keys to encrypt for it.
--
--   olb_push_subscriptions  one row per browser/device. endpoint is unique:
--                           if someone else signs in on the same device and
--                           turns notifications on, the row moves to them.
--                           Rows the push service reports gone (404/410)
--                           are deleted when a send hits them.
--
-- The server saves, removes and sends with the service role
-- (lib/notifications/push.ts); members can read and remove their own rows.
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0127. Idempotent.

begin;

create table if not exists public.olb_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique check (char_length(endpoint) <= 2000),
  p256dh       text not null check (char_length(p256dh) <= 200),
  auth         text not null check (char_length(auth) <= 100),
  user_agent   text check (char_length(user_agent) <= 500),
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);

create index if not exists olb_push_subscriptions_user_idx on public.olb_push_subscriptions (user_id);

alter table public.olb_push_subscriptions enable row level security;

drop policy if exists "olb_push_subscriptions_select" on public.olb_push_subscriptions;
create policy "olb_push_subscriptions_select" on public.olb_push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "olb_push_subscriptions_delete" on public.olb_push_subscriptions;
create policy "olb_push_subscriptions_delete" on public.olb_push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
