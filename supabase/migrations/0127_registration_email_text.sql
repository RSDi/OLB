-- 0127_registration_email_text.sql
--
-- Settings → Registration Emails: the words in the registration receipt and
-- the 6-digit code email, changed from their originals. One row per changed
-- field (keys like 'receipt.intro'; the list and the originals live in
-- lib/teams/registration-email-text.ts). No row: the original wording.
-- Reset to original deletes the row.
--
-- Access: super-admins and the Registrations permission (0102) change them;
-- the board can read them. The emails themselves read with the service role.
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0126. Idempotent.

begin;

create table if not exists public.olb_registration_email_text (
  key         text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  value       text not null check (length(value) <= 2000),
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.olb_registration_email_text enable row level security;

drop policy if exists "olb_registration_email_text_select" on public.olb_registration_email_text;
create policy "olb_registration_email_text_select" on public.olb_registration_email_text
  for select to authenticated
  using ((select public.is_staff()) or (select public.can_manage_registrations()));

drop policy if exists "olb_registration_email_text_insert" on public.olb_registration_email_text;
create policy "olb_registration_email_text_insert" on public.olb_registration_email_text
  for insert to authenticated
  with check ((select public.can_manage_registrations()));

drop policy if exists "olb_registration_email_text_update" on public.olb_registration_email_text;
create policy "olb_registration_email_text_update" on public.olb_registration_email_text
  for update to authenticated
  using ((select public.can_manage_registrations()))
  with check ((select public.can_manage_registrations()));

drop policy if exists "olb_registration_email_text_delete" on public.olb_registration_email_text;
create policy "olb_registration_email_text_delete" on public.olb_registration_email_text
  for delete to authenticated
  using ((select public.can_manage_registrations()));

notify pgrst, 'reload schema';

commit;
