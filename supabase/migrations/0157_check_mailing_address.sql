-- 0157_check_mailing_address.sql
--
-- Club check remit-to columns. Kept at 0157 because #231's Supabase Preview
-- already applied this file on the first push — renaming it alone fails with
-- "Remote migration versions not found in local migrations directory."
-- RLS widen and the db-push note live in 0158. Do not seed.
-- After this lands, #215's inv_gmail should be 0159 (not a second 0157).
--
-- Apply with supabase db push.

begin;

alter table public.inv_reminder_settings
  add column if not exists check_payee text,
  add column if not exists check_address text;

notify pgrst, 'reload schema';

commit;
