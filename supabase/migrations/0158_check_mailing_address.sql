-- 0158_check_mailing_address.sql
--
-- Club check remit-to for invoices and registration receipts.
-- Empty on purpose — Jeff types it in Settings → Invoices. Do not seed.
-- Read fallback: MAIL_CHECK_ADDRESS env, then "reply for the mailing address".
-- Columns live on the existing inv_reminder_settings singleton (id = 1).
--
-- 0157 on this branch is the column add (already applied on #231 preview).
-- This file widens write RLS. After merge, #215's inv_gmail should be 0159.
--
-- Write RLS matches the app gate (invoicing OR Payments). Payments is the
-- treasurer grant; this row is club-wide settings (reminders, CC/BCC, remit-to),
-- not per-invoice data. Invoice rows stay inv_can_invoice() only.
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply with supabase db push.

begin;

alter table public.inv_reminder_settings
  add column if not exists check_payee text,
  add column if not exists check_address text;

drop policy if exists "inv_reminder_settings_write" on public.inv_reminder_settings;
create policy "inv_reminder_settings_write" on public.inv_reminder_settings
  for all to authenticated
  using ((select public.inv_can_invoice()) or (select public.can_manage_finances()))
  with check ((select public.inv_can_invoice()) or (select public.can_manage_finances()));

notify pgrst, 'reload schema';

commit;
