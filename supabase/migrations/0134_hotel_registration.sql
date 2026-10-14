-- 0134_hotel_registration.sql
--
-- Hotel registration for families, tracked per player like Handbook signature
-- (0098). The travel coordinator (Travel permission) marks players Booked and
-- emails or Slacks the families who still need it, the same way the board
-- chases a missing handbook.
--
--   olb_requirements.done_label  optional word for the green chip and the
--                                Done/Paid filter (e.g. Booked). Null keeps
--                                Done for a task and Paid for a fee.
--   Hotel registration           seeded task with done_label = Booked.
--   can_check_requirements()     also true for Travel.
--   can_slack_dm()               also true for Travel (follow-up DMs).
--   email / message policies     Travel can email families and see copies.
--
-- Apply via the Supabase SQL editor, after 0133. Idempotent.

begin;

alter table public.olb_requirements
  add column if not exists done_label text
    check (done_label is null or length(btrim(done_label)) between 1 and 20);

comment on column public.olb_requirements.done_label is
  'Word for a completed task or fee on Directory chips and filters (Booked, Done, Paid). Null = Done for tasks, Paid for fees.';

-- Seed: family hotel booking for travel weekends. No scan by default; the
-- coordinator marks Booked once the family has registered with the hotel.
insert into public.olb_requirements (name, description, kind, allow_file, done_label, sort_order)
select 'Hotel registration',
       'Family has registered for the hotel / room block for travel weekends.',
       'task', false, 'Booked', 20
where not exists (
  select 1 from public.olb_requirements where lower(name) = 'hotel registration' and deleted_at is null
);

-- If Hotel registration already exists without a done label (added by hand),
-- give it Booked so the Directory says Booked instead of Done.
update public.olb_requirements
   set done_label = 'Booked'
 where lower(name) = 'hotel registration'
   and deleted_at is null
   and (done_label is null or btrim(done_label) = '');

-- Travel coordinator: check players off on requirements (hotel registration
-- and the rest), for the players they can see.
create or replace function public.can_check_requirements()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_staff()
      or public.has_permission('player_requirements')
      or public.has_permission('travel')
$$;

-- Travel coordinator: Slack DMs to families for hotel follow-ups, same as the
-- Slack DMs grant. Super-admins still hold every permission.
create or replace function public.can_slack_dm()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_permission('slack_dm') or public.has_permission('travel')
$$;

revoke all on function public.can_check_requirements() from public, anon;
grant execute on function public.can_check_requirements() to authenticated, service_role;
revoke all on function public.can_slack_dm() from public, anon;
grant execute on function public.can_slack_dm() to authenticated, service_role;

-- Email templates: Travel starts a follow-up from one (slack path already
-- covered once can_slack_dm includes travel; email path needs Travel too).
drop policy if exists "olb_email_templates_select" on public.olb_email_templates;
create policy "olb_email_templates_select" on public.olb_email_templates
  for select to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_registrations())
    or (select public.can_slack_dm())
    or (select public.can_manage_finances())
    or (select public.can_manage_travel())
  );

-- Copies of emails and Slack DMs on player pages.
drop policy if exists "olb_player_messages_select" on public.olb_player_messages;
create policy "olb_player_messages_select" on public.olb_player_messages
  for select to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_registrations())
    or (select public.can_slack_dm())
    or (select public.can_manage_finances())
    or (select public.can_manage_travel())
  );

-- Travel can insert email rows; Slack rows already go through can_slack_dm().
drop policy if exists "olb_player_messages_insert" on public.olb_player_messages;
create policy "olb_player_messages_insert" on public.olb_player_messages
  for insert to authenticated
  with check (
    sent_by = (select auth.uid())
    and (
      (via = 'email' and (
        (select public.is_staff())
        or (select public.can_manage_registrations())
        or (select public.can_manage_travel())
      ))
      or (via = 'slack' and (select public.can_slack_dm()))
    )
  );

notify pgrst, 'reload schema';

commit;
