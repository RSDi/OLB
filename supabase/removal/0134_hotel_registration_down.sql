-- Down for 0134_hotel_registration.sql
-- Restores can_check_requirements / can_slack_dm and message policies to the
-- 0123 / 0133 shapes, drops done_label, and retires Hotel registration.
-- Does not delete olb_player_requirements rows already marked for it.

begin;

create or replace function public.can_check_requirements()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff() or public.has_permission('player_requirements') $$;

create or replace function public.can_slack_dm()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_permission('slack_dm') $$;

revoke all on function public.can_check_requirements() from public, anon;
grant execute on function public.can_check_requirements() to authenticated, service_role;
revoke all on function public.can_slack_dm() from public, anon;
grant execute on function public.can_slack_dm() to authenticated, service_role;

drop policy if exists "olb_email_templates_select" on public.olb_email_templates;
create policy "olb_email_templates_select" on public.olb_email_templates
  for select to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_registrations())
    or (select public.can_slack_dm())
    or (select public.can_manage_finances())
  );

drop policy if exists "olb_player_messages_select" on public.olb_player_messages;
create policy "olb_player_messages_select" on public.olb_player_messages
  for select to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_registrations())
    or (select public.can_slack_dm())
    or (select public.can_manage_finances())
  );

drop policy if exists "olb_player_messages_insert" on public.olb_player_messages;
create policy "olb_player_messages_insert" on public.olb_player_messages
  for insert to authenticated
  with check (
    sent_by = (select auth.uid())
    and (
      (via = 'email' and ((select public.is_staff()) or (select public.can_manage_registrations())))
      or (via = 'slack' and (select public.can_slack_dm()))
    )
  );

update public.olb_requirements
   set deleted_at = coalesce(deleted_at, now())
 where lower(name) = 'hotel registration'
   and deleted_at is null;

alter table public.olb_requirements drop column if exists done_label;

notify pgrst, 'reload schema';

commit;
