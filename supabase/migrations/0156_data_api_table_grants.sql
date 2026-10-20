-- 0156_data_api_table_grants.sql
--
-- Supabase change effective 2026-10-30: new tables in schema public no
-- longer get automatic Data API grants. Without an explicit GRANT,
-- supabase-js / PostgREST returns "permission denied". Existing tables
-- keep the grants they already have (baseline GRANT ALL, later default
-- privileges, or a per-table grant in the creating migration).
--
-- This file names every public table created after the baseline that
-- never got a table GRANT in its own migration, and grants what the
-- app actually uses:
--
--   authenticated, service_role  DML — portal reads and writes through
--                                supabase-js as the signed-in member
--                                (lib/supabase/client.ts and server.ts)
--                                or the service role (lib/supabase/admin.ts).
--                                RLS still decides which rows.
--   service_role only            hashed secrets, OAuth tokens, pairing
--                                codes: the creating migration revokes
--                                authenticated (or never had policies for
--                                it) and the code uses createAdminClient().
--
-- No anon grants: the only anonymous Data API reads are site_menu_items
-- and site_content (0120), which already grant select to anon.
--
-- Numbered 0156 so it sits after open PRs that already took 0154/0155
-- (#215 inv_gmail, #219 olb_roadmap_events). Those PRs now grant in
-- their own files; this file still IF EXISTS-grants them as a safety net.
--
-- GRANT is idempotent. Does not change RLS, policies, or the baseline's
-- ALTER DEFAULT PRIVILEGES (those still grant ALL to anon on tables
-- created by postgres — broader than needed; follow-up).
--
-- Apply with supabase db push. Merge and push #215 and #219 first, then
-- this PR (#220), so 0154/0155 run before 0156. If this lands first, apply
-- the skipped 0154/0155 files with `supabase db push --include-all`.
-- Idempotent.

begin;

-- Signed-in members (and the service role) reach these through PostgREST.
grant select, insert, update, delete on
  public.activity_events,
  public.contact_versions,
  public.hs_hosted,
  public.hs_hosted_divisions,
  public.hs_hosted_finance,
  public.hs_hosted_games,
  public.hs_hosted_messages,
  public.hs_hosted_money,
  public.hs_hosted_steps,
  public.hs_hosted_teams,
  public.hs_hotel_stay_players,
  public.hs_hotel_stays,
  public.hs_levels,
  public.hs_opponents,
  public.hs_seasons,
  public.hs_weekend_games,
  public.hs_weekends,
  public.inv_invoices,
  public.inv_line_items,
  public.inv_payments,
  public.inv_reminder_sends,
  public.inv_reminder_settings,
  public.inv_sequences,
  public.member_previews,
  public.olb_age_caps,
  public.olb_balance_reminders,
  public.olb_boards,
  public.olb_budget_groups,
  public.olb_budget_line_charges,
  public.olb_budget_lines,
  public.olb_charges,
  public.olb_coaches,
  public.olb_email_templates,
  public.olb_expense_payments,
  public.olb_finance_settings,
  public.olb_fundraiser_shifts,
  public.olb_fundraisers,
  public.olb_hosted_events,
  public.olb_import_batches,
  public.olb_income,
  public.olb_onboarding_email_text,
  public.olb_onboarding_emails,
  public.olb_onboarding_families,
  public.olb_onboarding_offers,
  public.olb_onboarding_settings,
  public.olb_onboarding_slack,
  public.olb_onboarding_waitlist,
  public.olb_payments,
  public.olb_player_due,
  public.olb_player_messages,
  public.olb_player_notes,
  public.olb_player_parents,
  public.olb_player_requirements,
  public.olb_players,
  public.olb_program_funds,
  public.olb_program_signups,
  public.olb_programs,
  public.olb_push_subscriptions,
  public.olb_registration_email_text,
  public.olb_registration_messages,
  public.olb_registrations,
  public.olb_reminder_pauses,
  public.olb_requirements,
  public.olb_roadmap_items,
  public.olb_roadmap_link,
  public.olb_team_volunteers,
  public.olb_teams,
  public.olb_uniform_items,
  public.olb_uniform_settings,
  public.olb_uniform_sizes,
  public.olb_volunteer_roles,
  public.planning_meeting_note_versions,
  public.planning_meeting_notes,
  public.planning_meeting_versions,
  public.planning_meetings,
  public.planning_roles,
  public.planning_templates,
  public.search_log,
  public.sidebar_links
  to authenticated, service_role;

-- Server only (service role). Creating migrations revoke authenticated
-- and/or leave RLS on with no member policies.
grant select, insert, update, delete on
  public.device_pairings,
  public.game_film_youtube,
  public.game_film_youtube_events,
  public.game_film_youtube_jobs,
  public.member_slack_connections,
  public.olb_agent_keys,
  public.olb_registration_codes,
  public.public_directory_link
  to service_role;

-- Tables from open PRs that may or may not exist when this runs.
-- inv_gmail (#215): service role only, same as game_film_youtube.
-- olb_roadmap_events (#219): super-admins select as authenticated;
-- the bot writes with the service role (no member insert/update/delete).
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'inv_gmail' and c.relkind = 'r'
  ) then
    execute 'grant select, insert, update, delete on public.inv_gmail to service_role';
  end if;
  if exists (
    select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'olb_roadmap_events' and c.relkind = 'r'
  ) then
    execute 'grant select on public.olb_roadmap_events to authenticated, service_role';
    execute 'grant insert, update, delete on public.olb_roadmap_events to service_role';
  end if;
end $$;

commit;
