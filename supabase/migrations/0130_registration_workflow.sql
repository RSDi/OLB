-- 0130_registration_workflow.sql
--
-- The registration workflow trial: the family checklist, the public waitlist
-- form, spot offers, automatic emails with an off switch for each, uniform
-- sizes and Sarah's Uniforms page. Everything sits behind one switch per
-- season (olb_onboarding_settings.enabled, off to start), so with it off the
-- registration form, Approve, the Waitlist tab and Payments work exactly as
-- before.
--
-- New tables only. No existing table or column is changed; the one thing
-- this adds to existing data is rows: registrations the waitlist form saves
-- (status 'waitlisted', extra.source = 'waitlist_form'), uniform charges
-- in olb_charges (category 'uniform', which 0101 already allows) and
-- Handbook signature check-offs in olb_player_requirements.
--
--   olb_onboarding_settings    one row per season: the switch, Pause all,
--                              each automatic email's mode (off / ask / on),
--                              the approval switches, the Slack invite link
--                              and the season's dates
--   olb_onboarding_email_text  the words of the automatic emails, changed
--                              from their originals (like 0127)
--   olb_onboarding_emails      every automatic email: waiting for someone to
--                              press Send ("Ask me first"), sent, skipped or
--                              failed. dedupe_key stops one going out twice
--   olb_onboarding_families    the private checklist link each registering
--                              family gets
--   olb_onboarding_offers      "Offer a spot": the private registration link,
--                              its expiry, check-in and close-out
--   olb_onboarding_waitlist    coach notes on waitlisted players: seen at a
--                              clinic, coach thumbs-up
--   olb_onboarding_slack       who has joined Slack, by email, from the
--                              nightly check
--   olb_uniform_settings       one row per season: try-on, order deadline,
--                              when families are charged
--   olb_uniform_items          the items, prices and sizes Sarah sets
--   olb_uniform_sizes          each player's size for each item
--
-- A new permission, "uniforms" (lib/auth/access.ts), with its helper
-- can_manage_uniforms(). Super-admins always have it.
--
-- Access: the Registrations permission (0102) runs the workflow; the board
-- can read it. Uniforms: the uniforms permission and Registrations. The
-- family link, offer tokens and email log are read and written by the server
-- only (service role): RLS on, no policies. Helper calls are wrapped in
-- (select …) per AGENTS.md.
--
-- To remove the trial: supabase/removal/0130_registration_workflow_down.sql.
--
-- Apply via the Supabase SQL editor, after 0129. Idempotent.

begin;

-- ─── Helper ─────────────────────────────────────────────────────────────────

create or replace function public.can_manage_uniforms()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_super_admin() or public.has_permission('uniforms') or public.has_permission('registrations') $$;

revoke all on function public.can_manage_uniforms() from public, anon;
grant execute on function public.can_manage_uniforms() to authenticated, service_role;

-- ─── Settings ───────────────────────────────────────────────────────────────

create table if not exists public.olb_onboarding_settings (
  board_id                 uuid primary key references public.olb_boards(id) on delete cascade,
  enabled                  boolean not null default false,
  paused                   boolean not null default false,
  -- { "welcome": "on", "open_items": "ask", … }; a missing key is "off".
  modes                    jsonb not null default '{}'::jsonb,
  auto_approve_offer       boolean not null default false,
  auto_approve_returning   boolean not null default false,
  handbook_url             text check (handbook_url is null or length(handbook_url) <= 500),
  slack_invite_url         text check (slack_invite_url is null or length(slack_invite_url) <= 500),
  slack_invite_expires_on  date,
  offer_days               int not null default 5 check (offer_days between 2 and 30),
  clinic_info              text check (clinic_info is null or length(clinic_info) <= 1000),
  parent_meeting           text check (parent_meeting is null or length(parent_meeting) <= 300),
  parent_meeting_on        date,
  first_practice_on        date,
  updated_by               uuid references auth.users(id) on delete set null,
  updated_at               timestamptz not null default now()
);

alter table public.olb_onboarding_settings enable row level security;

drop policy if exists "olb_onboarding_settings_select" on public.olb_onboarding_settings;
create policy "olb_onboarding_settings_select" on public.olb_onboarding_settings
  for select to authenticated
  using ((select public.is_staff()) or (select public.can_manage_registrations()) or (select public.can_manage_uniforms()));

drop policy if exists "olb_onboarding_settings_insert" on public.olb_onboarding_settings;
create policy "olb_onboarding_settings_insert" on public.olb_onboarding_settings
  for insert to authenticated
  with check ((select public.can_manage_registrations()));

drop policy if exists "olb_onboarding_settings_update" on public.olb_onboarding_settings;
create policy "olb_onboarding_settings_update" on public.olb_onboarding_settings
  for update to authenticated
  using ((select public.can_manage_registrations()))
  with check ((select public.can_manage_registrations()));

-- ─── Email words ────────────────────────────────────────────────────────────

create table if not exists public.olb_onboarding_email_text (
  key         text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  value       text not null check (length(value) <= 4000),
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.olb_onboarding_email_text enable row level security;

drop policy if exists "olb_onboarding_email_text_select" on public.olb_onboarding_email_text;
create policy "olb_onboarding_email_text_select" on public.olb_onboarding_email_text
  for select to authenticated
  using ((select public.is_staff()) or (select public.can_manage_registrations()));

drop policy if exists "olb_onboarding_email_text_write" on public.olb_onboarding_email_text;
create policy "olb_onboarding_email_text_write" on public.olb_onboarding_email_text
  for all to authenticated
  using ((select public.can_manage_registrations()))
  with check ((select public.can_manage_registrations()));

-- ─── Server-only tables ─────────────────────────────────────────────────────

create table if not exists public.olb_onboarding_emails (
  id                uuid primary key default gen_random_uuid(),
  board_id          uuid not null references public.olb_boards(id) on delete cascade,
  kind              text not null check (kind ~ '^[a-z_0-9]+$'),
  dedupe_key        text not null unique check (length(dedupe_key) <= 300),
  to_emails         text[] not null default '{}',
  subject           text not null default '' check (length(subject) <= 300),
  body              text not null default '' check (length(body) <= 8000),
  registration_ids  uuid[] not null default '{}',
  status            text not null check (status in ('waiting', 'sending', 'sent', 'skipped', 'failed')),
  error             text,
  created_at        timestamptz not null default now(),
  decided_by        uuid references auth.users(id) on delete set null,
  decided_at        timestamptz,
  sent_at           timestamptz
);

create index if not exists olb_onboarding_emails_board_idx on public.olb_onboarding_emails (board_id, status, created_at desc);

create table if not exists public.olb_onboarding_families (
  id                uuid primary key default gen_random_uuid(),
  board_id          uuid not null references public.olb_boards(id) on delete cascade,
  -- The form's one-time submit key, so a double tap finds the same family.
  submission_key    text not null unique check (length(submission_key) between 8 and 80),
  -- The secret in the checklist link (/family/<token>).
  token             text not null unique check (length(token) >= 24),
  email             text,
  registration_ids  uuid[] not null default '{}',
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz
);

create table if not exists public.olb_onboarding_offers (
  id               uuid primary key default gen_random_uuid(),
  board_id         uuid not null references public.olb_boards(id) on delete cascade,
  registration_id  uuid not null references public.olb_registrations(id) on delete cascade,
  token            text not null unique check (length(token) >= 24),
  status           text not null default 'open' check (status in ('open', 'used', 'expired', 'withdrawn')),
  sent_to          text[] not null default '{}',
  sent_at          timestamptz not null default now(),
  expires_at       timestamptz not null,
  reminded_at      timestamptz,
  closed_at        timestamptz,
  created_by       uuid references auth.users(id) on delete set null
);

create index if not exists olb_onboarding_offers_reg_idx on public.olb_onboarding_offers (registration_id, sent_at desc);
create index if not exists olb_onboarding_offers_open_idx on public.olb_onboarding_offers (status, expires_at);

create table if not exists public.olb_onboarding_waitlist (
  registration_id  uuid primary key references public.olb_registrations(id) on delete cascade,
  clinic_seen_on   date,
  coach_ok_at      timestamptz,
  coach_ok_by      uuid references auth.users(id) on delete set null
);

create table if not exists public.olb_onboarding_slack (
  email          text primary key check (email = lower(email)),
  slack_user_id  text,
  joined         boolean not null default false,
  checked_at     timestamptz not null default now()
);

alter table public.olb_onboarding_emails enable row level security;
alter table public.olb_onboarding_families enable row level security;
alter table public.olb_onboarding_offers enable row level security;
alter table public.olb_onboarding_waitlist enable row level security;
alter table public.olb_onboarding_slack enable row level security;

-- ─── Uniforms ───────────────────────────────────────────────────────────────

create table if not exists public.olb_uniform_settings (
  board_id        uuid primary key references public.olb_boards(id) on delete cascade,
  try_on          text check (try_on is null or length(try_on) <= 300),
  order_deadline  date,
  -- 'order': when Sarah marks the order placed. 'registration': on Approve.
  charge_when     text not null default 'order' check (charge_when in ('order', 'registration')),
  ordered_at      timestamptz,
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

create table if not exists public.olb_uniform_items (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.olb_boards(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  -- 'all': everyone who needs a uniform. 'hs': high school players who need
  -- grays. 'optional': families choose (warm-ups).
  who          text not null default 'all' check (who in ('all', 'hs', 'optional')),
  price_cents  int check (price_cents is null or price_cents >= 0),
  sizes        text[] not null default '{}',
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists olb_uniform_items_board_idx on public.olb_uniform_items (board_id, sort_order);

create table if not exists public.olb_uniform_sizes (
  id               uuid primary key default gen_random_uuid(),
  board_id         uuid not null references public.olb_boards(id) on delete cascade,
  registration_id  uuid references public.olb_registrations(id) on delete cascade,
  player_id        uuid references public.olb_players(id) on delete cascade,
  item_id          uuid not null references public.olb_uniform_items(id) on delete cascade,
  size             text not null check (length(btrim(size)) between 1 and 20),
  confirmed_at     timestamptz,
  confirmed_by     uuid references auth.users(id) on delete set null,
  charge_id        uuid references public.olb_charges(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint olb_uniform_sizes_owner check (registration_id is not null or player_id is not null)
);

-- One size per item per registration. A full index (not partial), so
-- upserts can name it; sizes with no registration (typed in at try-on)
-- have a null there and never clash.
drop index if exists public.olb_uniform_sizes_reg_item;
create unique index if not exists olb_uniform_sizes_reg_item on public.olb_uniform_sizes (registration_id, item_id);
create index if not exists olb_uniform_sizes_player_idx on public.olb_uniform_sizes (player_id);

alter table public.olb_uniform_settings enable row level security;
alter table public.olb_uniform_items enable row level security;
alter table public.olb_uniform_sizes enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['olb_uniform_settings', 'olb_uniform_items', 'olb_uniform_sizes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_staff()) or (select public.can_manage_uniforms()))',
      t || '_select', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.can_manage_uniforms())) with check ((select public.can_manage_uniforms()))',
      t || '_write', t
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';

commit;
