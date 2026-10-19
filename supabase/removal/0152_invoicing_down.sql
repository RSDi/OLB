-- Undo 0152 invoicing. Drops module tables and OLB helpers. Does not remove
-- the invoicing key from access_profiles (harmless leftover).

begin;

drop policy if exists "inv_invoices_select" on public.inv_invoices;
drop policy if exists "inv_invoices_write" on public.inv_invoices;
drop policy if exists "inv_line_items_select" on public.inv_line_items;
drop policy if exists "inv_line_items_write" on public.inv_line_items;
drop policy if exists "inv_payments_select" on public.inv_payments;
drop policy if exists "inv_payments_write" on public.inv_payments;
drop policy if exists "inv_reminder_settings_select" on public.inv_reminder_settings;
drop policy if exists "inv_reminder_settings_write" on public.inv_reminder_settings;
drop policy if exists "inv_reminder_sends_select" on public.inv_reminder_sends;
drop policy if exists "inv_reminder_sends_write" on public.inv_reminder_sends;
drop policy if exists "inv_sequences_select" on public.inv_sequences;

drop table if exists public.inv_reminder_sends;
drop table if exists public.inv_reminder_settings;
drop table if exists public.inv_payments;
drop table if exists public.inv_line_items;
drop table if exists public.inv_invoices;
drop table if exists public.inv_sequences;

drop function if exists public.inv_next_number(int);
drop function if exists public.inv_can_view_invoices();
drop function if exists public.inv_can_invoice();
drop function if exists public.can_view_invoices();
drop function if exists public.can_manage_invoicing();
drop function if exists public.holds_invoicing_planning_role();

delete from public.hs_hosted_steps where step_key in ('bill_programs', 'invoices_sent');
alter table public.hs_hosted_steps drop column if exists step_key;

commit;
