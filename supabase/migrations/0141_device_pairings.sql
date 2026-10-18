-- ADDITIVE: run BEFORE the deploy.
-- Phone-to-device sign-in (QR pairing).
-- Service role only. RLS on, no anon or
-- authenticated policies.
--
-- OLB has no automated migrations. Paste this
-- file into the Supabase SQL editor before merge.

create table if not exists public.device_pairings (
  id                 uuid primary key
                     default gen_random_uuid(),
  host               text not null,
  secret_hash        text not null,
  user_code_hmac     text not null,
  status             text not null default 'pending',
  wrong_picks        int  not null default 0,
  device_ua          text not null default '',
  device_ip          inet,
  device_city        text,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  approved_at        timestamptz,
  approved_by_email  text,
  approved_by_user_id uuid,
  approver_sid       uuid,
  approver_ip        inet,
  consumed_at        timestamptz,
  session_id         uuid,
  session_expires_at timestamptz,
  last_poll_at       timestamptz,
  revoked_at         timestamptz,
  revoked_by_email   text,
  constraint device_pairings_status_check
    check (status in ('pending','approved',
      'denied','expired','consumed','revoked'))
);

create index if not exists device_pairings_ip_idx
  on public.device_pairings (device_ip, created_at desc);
create index if not exists device_pairings_user_idx
  on public.device_pairings
  (approved_by_email, created_at desc);
create index if not exists device_pairings_session_idx
  on public.device_pairings (session_id)
  where session_id is not null;

alter table public.device_pairings
  enable row level security;

notify pgrst, 'reload schema';
