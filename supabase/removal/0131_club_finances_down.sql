-- 0131_club_finances_down.sql
--
-- Removes club finances (0131). Kept outside supabase/migrations so it never
-- runs by accident. Run it in the Supabase SQL editor only after the code is
-- gone, and after downloading what you want to keep (Payments → Snapshot →
-- "Download spreadsheet" has the budget, payments and income).
--
-- What stays: charges and credits already on families' Payments accounts.
-- Their new categories are folded into the old ones first ('program',
-- 'team_cost', 'merch' → 'other'; 'coach_comp', 'fundraising' →
-- 'adjustment'), so the original check can come back. Descriptions keep
-- what each was ("Coach's kid comp", "Nelson's Produce – Tulip Festival").
--
-- Idempotent.

begin;

update public.olb_charges set category = 'other'
 where kind = 'charge' and category in ('program', 'team_cost', 'merch');
update public.olb_charges set category = 'adjustment'
 where kind = 'credit' and category in ('coach_comp', 'fundraising');

alter table public.olb_charges drop constraint if exists olb_charges_category_check;
alter table public.olb_charges add constraint olb_charges_category_check check (
  (kind = 'charge' and category in ('registration', 'uniform', 'tournament', 'refund', 'other'))
  or (kind = 'credit' and category in ('covered', 'scholarship', 'adjustment'))
);

drop table if exists public.olb_fundraiser_shifts;
drop table if exists public.olb_income;
drop table if exists public.olb_fundraisers;
drop table if exists public.olb_program_funds;
drop table if exists public.olb_program_signups;
drop table if exists public.olb_budget_line_charges;
drop table if exists public.olb_expense_payments;
drop table if exists public.olb_budget_lines;
drop table if exists public.olb_programs;
drop table if exists public.olb_hosted_events;
drop table if exists public.olb_budget_groups;
drop table if exists public.olb_player_due;
drop table if exists public.olb_finance_settings;
drop function if exists public.can_view_finances();

notify pgrst, 'reload schema';

commit;
