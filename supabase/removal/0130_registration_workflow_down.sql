-- 0130_registration_workflow_down.sql
--
-- Removes the registration workflow trial (0130). Kept outside
-- supabase/migrations so it never runs by accident. Run it in the Supabase
-- SQL editor only after the code is gone, and after downloading anything
-- you want to keep (handbook signatures live on each registration;
-- uniform sizes and the email log are in the tables below).
--
-- What stays: registrations the waitlist form saved (Waitlist tab), uniform
-- charges already on families' Payments accounts, and Handbook signature
-- check-offs. Those are ordinary rows in existing tables.
--
-- Idempotent.

begin;

drop table if exists public.olb_uniform_sizes;
drop table if exists public.olb_uniform_items;
drop table if exists public.olb_uniform_settings;
drop table if exists public.olb_onboarding_slack;
drop table if exists public.olb_onboarding_waitlist;
drop table if exists public.olb_onboarding_offers;
drop table if exists public.olb_onboarding_families;
drop table if exists public.olb_onboarding_emails;
drop table if exists public.olb_onboarding_email_text;
drop table if exists public.olb_onboarding_settings;
drop function if exists public.can_manage_uniforms();

notify pgrst, 'reload schema';

commit;
