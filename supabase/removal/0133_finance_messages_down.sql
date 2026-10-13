-- Undoes 0133: the reminder settings, log and pauses, and Payments' read
-- access to templates and sent messages.

drop table if exists public.olb_reminder_pauses;
drop table if exists public.olb_balance_reminders;

alter table public.olb_finance_settings
  drop column if exists reminder_enabled,
  drop column if exists reminder_weekday,
  drop column if exists reminder_start,
  drop column if exists reminder_offset_days,
  drop column if exists reminder_roles,
  drop column if exists reminder_subject,
  drop column if exists reminder_body;

drop policy if exists "olb_email_templates_select" on public.olb_email_templates;
create policy "olb_email_templates_select" on public.olb_email_templates
  for select to authenticated
  using ((select public.is_staff()) or (select public.can_manage_registrations()) or (select public.can_slack_dm()));

drop policy if exists "olb_player_messages_select" on public.olb_player_messages;
create policy "olb_player_messages_select" on public.olb_player_messages
  for select to authenticated
  using ((select public.is_staff()) or (select public.can_manage_registrations()) or (select public.can_slack_dm()));

notify pgrst, 'reload schema';
