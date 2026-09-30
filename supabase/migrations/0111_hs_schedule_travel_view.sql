-- 0111_hs_schedule_travel_view.sql
--
-- The travel coordinator (the Travel permission, 0110) sees the HS Schedule
-- without changing it: the seasons, our teams (the columns), the weekends,
-- each team's games and the teams coming, to book the hotel blocks and meals
-- for the weekends away (lib/hs-schedule/access.ts canViewHsSchedule).
--
-- Read only: these are select policies. Who writes is still the planners'
-- policies from 0108 (the board and the coaches), and the server actions ask
-- can_plan_hs_schedule() before any change. External Contacts stay as 0109
-- and 0110 set them, so the programs on the schedule show by the names
-- stored with it.
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0110. Idempotent.

begin;

do $$
declare t text;
begin
  foreach t in array array['hs_seasons', 'hs_levels', 'hs_weekends', 'hs_weekend_games', 'hs_opponents'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_travel', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.can_manage_travel()))',
      t || '_select_travel', t
    );
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
