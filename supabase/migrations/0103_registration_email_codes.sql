-- 0103_registration_email_codes.sql
--
-- The public registration form starts with the family's email. We email a
-- 6-digit code to it, and only once the code is typed back does the form
-- fill in what we already know about that family (their players, address
-- and parents). Without it, anyone who knew a parent's email could read the
-- family's details off a public page.
--
--   olb_registration_codes  one row per code sent. Only a hash of the code is
--                           kept. A code lasts 10 minutes and allows 5 tries;
--                           the server sends at most 5 an hour to one email.
--                           verified_at marks the code that was typed back,
--                           so a registration sent soon after is marked
--                           "email confirmed" for the reviewer.
--
-- Only the server touches it (lib/teams/registration-actions.ts, with the
-- service role): RLS is on and there are no policies.
--
-- Apply via the Supabase SQL editor, after 0102. Idempotent.

begin;

create table if not exists public.olb_registration_codes (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(btrim(email))),
  code_hash    text not null,
  attempts     int  not null default 0,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  verified_at  timestamptz
);

create index if not exists olb_registration_codes_email_idx
  on public.olb_registration_codes (email, created_at desc);

alter table public.olb_registration_codes enable row level security;

commit;
