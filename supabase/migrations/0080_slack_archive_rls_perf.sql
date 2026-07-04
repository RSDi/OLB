-- 0080_slack_archive_rls_perf.sql
--
-- Fixes a real production timeout: archive_author_counts() (0079) runs in
-- 6.6ms as the Postgres superuser (bypasses RLS), and instantly when called
-- directly as a function — but timed out every time through the website,
-- which calls it under RLS as the logged-in session.
--
-- Root cause: every policy 0077 added calls `public.is_super_admin()` bare,
-- e.g. `using (public.is_super_admin())`. Without wrapping it in a SELECT,
-- Postgres can't hoist the call into a single InitPlan — it re-evaluates
-- the function, and therefore its own subquery against `members`, ONCE PER
-- ROW being checked. For a GROUP BY scanning all of slack_archive_messages
-- (9,500+ rows and growing), that's 9,500+ separate `members` lookups
-- instead of one, which is exactly the kind of overhead that's invisible
-- in small per-channel queries but compounds badly on a full-table scan —
-- and apparently enough to blow the statement_timeout the authenticated
-- role runs under via PostgREST, well before Postgres would ever call it
-- slow in absolute terms.
--
-- This is a documented Postgres/Supabase RLS performance pitfall (see:
-- "Call functions with SELECT" in Supabase's RLS performance guidance) —
-- wrapping the call as `(select public.is_super_admin())` lets the planner
-- evaluate it once and reuse the result for every row, instead of once per
-- row. Same policies as 0077, same semantics, just fixed to not silently
-- multiply an otherwise-cheap function call across the whole table.
--
-- Depends on 0077. Idempotent.

begin;

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('slack_archive_channels', 'slack_archive_messages', 'slack_archive_sync_state')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "slack_archive_channels_select_super" on public.slack_archive_channels
  for select to authenticated
  using ((select public.is_super_admin()));
create policy "slack_archive_channels_insert_super" on public.slack_archive_channels
  for insert to authenticated
  with check ((select public.is_super_admin()));
create policy "slack_archive_channels_update_super" on public.slack_archive_channels
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

create policy "slack_archive_messages_select_super" on public.slack_archive_messages
  for select to authenticated
  using ((select public.is_super_admin()));
create policy "slack_archive_sync_state_select_super" on public.slack_archive_sync_state
  for select to authenticated
  using ((select public.is_super_admin()));

commit;
