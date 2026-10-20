-- Club check remit-to for invoices and registration receipts.
-- Empty on purpose — Jeff types it in Settings → Invoices. Do not seed.
-- Read fallback: MAIL_CHECK_ADDRESS env, then "reply for the mailing address".
-- Columns live on the existing inv_reminder_settings singleton (id = 1).

begin;

alter table public.inv_reminder_settings
  add column if not exists check_payee text,
  add column if not exists check_address text;

notify pgrst, 'reload schema';

commit;
