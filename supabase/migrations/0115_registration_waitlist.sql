-- 0115_registration_waitlist.sql
--
-- The registration waitlist. "Not this season" becomes Waitlist: families
-- the club can't place yet stay listed on the Directory's New registrations
-- page, so the board can reach them and approve them when a spot opens.
--
--   olb_registrations.status   gains 'waitlisted'. Registrations already
--                              set aside ('rejected', from Not this season)
--                              move to the waitlist. 'rejected' now means
--                              removed (a test, or a family that withdrew):
--                              kept, but shown nowhere.
--   olb_registrations.notes    (from 0089) holds the reviewer's note on why.
--   contacted_at, contacted_by "Contacted Oct 3 by Rachel", so two people
--                              don't both reach out.
--   olb_registration_messages  each email sent to a family from the page,
--                              one row per registration it was about.
--
-- Access: the Registrations permission (0102) reads and adds messages;
-- registrations themselves are already readable and updatable by it. Helper
-- calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0114. Idempotent.

begin;

alter table public.olb_registrations
  drop constraint if exists olb_registrations_status_check;
alter table public.olb_registrations
  add constraint olb_registrations_status_check
  check (status in ('pending', 'approved', 'waitlisted', 'rejected'));

update public.olb_registrations set status = 'waitlisted' where status = 'rejected';

alter table public.olb_registrations
  add column if not exists contacted_at timestamptz,
  add column if not exists contacted_by uuid references auth.users(id) on delete set null;

create table if not exists public.olb_registration_messages (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null references public.olb_registrations(id) on delete cascade,
  subject          text not null check (length(btrim(subject)) between 1 and 200),
  body             text not null check (length(btrim(body)) between 1 and 5000),
  sent_to          text[] not null default '{}',
  sent_by          uuid references auth.users(id) on delete set null,
  sent_at          timestamptz not null default now()
);

create index if not exists olb_registration_messages_registration_idx
  on public.olb_registration_messages (registration_id, sent_at desc);

alter table public.olb_registration_messages enable row level security;

drop policy if exists "olb_registration_messages_registrar_select" on public.olb_registration_messages;
create policy "olb_registration_messages_registrar_select" on public.olb_registration_messages
  for select to authenticated
  using ((select public.can_manage_registrations()));

drop policy if exists "olb_registration_messages_registrar_insert" on public.olb_registration_messages;
create policy "olb_registration_messages_registrar_insert" on public.olb_registration_messages
  for insert to authenticated
  with check ((select public.can_manage_registrations()) and sent_by = (select auth.uid()));

notify pgrst, 'reload schema';

commit;
