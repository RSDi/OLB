-- 0085_directory_rls_perf.sql
--
-- Fixes the slow member directory. Same root cause 0080 fixed for the Slack
-- archive, on the tables every directory view reads in full.
--
-- 1. Every SELECT policy on members, member_relationships, volunteer_teams and
--    member_volunteer_teams calls its helper bare, e.g.
--    `using (public.is_approved())`. Postgres can't hoist a bare call into a
--    single InitPlan, so it runs the helper — and the helper's own lookup
--    against members — once PER ROW. Loading the directory's ~450 members
--    ran ~450 extra members lookups; loading all relationships ran one per
--    relationship row. Wrapping each call as `(select public.is_approved())`
--    lets the planner evaluate it once per query. See "Call functions with
--    SELECT" in Supabase's RLS performance guidance.
--
-- 2. Those helpers (is_staff / is_super_admin / is_approved) all look up the
--    caller's row by members.user_id, and nothing in the migrations indexes
--    that column (members predates this folder), so each lookup can be a full
--    scan of members. Adding the index makes every helper call — including
--    the ones still made by other tables' policies — an index lookup.
--
-- Measured with EXPLAIN ANALYZE on a local replay of these migrations with
-- ~500 members / ~1,250 relationship rows, as an approved member through RLS:
-- the All members query went from ~600ms to under 1ms, all relationships from
-- ~580ms to under 1ms. (The index alone gets each to ~9ms; wrapping the calls
-- does the rest.)
--
-- Same policy names, roles and conditions as before — only the helper calls
-- are wrapped — so who can see what is unchanged. Write policies are left
-- alone (they only ever touch a row or two). Idempotent; safe to re-run.
--
-- Depends on 0019 (is_approved), 0032 (members policies), 0036 (volunteer
-- teams), 0049 (helper definitions).

begin;

-- ---------------------------------------------------------------------------
-- 1. Index the column every role helper looks up. Skipped if production
--    already has a usable index leading with user_id (e.g. a unique
--    constraint from when members was first created), so we never add a
--    duplicate.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_attribute a
        on a.attrelid = i.indrelid
       and a.attnum = i.indkey[0]
     where i.indrelid = 'public.members'::regclass
       and a.attname = 'user_id'
       and i.indisvalid
       and i.indpred is null
  ) then
    create index members_user_id_idx on public.members (user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. members SELECT policies (latest definitions: 0032).
-- ---------------------------------------------------------------------------

drop policy if exists "members_self_select" on public.members;
create policy "members_self_select" on public.members
  for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

drop policy if exists "members_staff_select_all" on public.members;
create policy "members_staff_select_all" on public.members
  for select to authenticated
  using ((select public.is_staff()) and deleted_at is null);

drop policy if exists "members_directory_select" on public.members;
create policy "members_directory_select" on public.members
  for select to authenticated
  using (
    status = 'approved'
    and deleted_at is null
    and (select public.is_approved())
  );

drop policy if exists "members_super_select_all" on public.members;
create policy "members_super_select_all" on public.members
  for select to authenticated
  using ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- 3. member_relationships SELECT policy (latest definition: 0019).
-- ---------------------------------------------------------------------------

drop policy if exists "member_relationships_select_approved" on public.member_relationships;
create policy "member_relationships_select_approved" on public.member_relationships
  for select to authenticated
  using ((select public.is_approved()));

-- ---------------------------------------------------------------------------
-- 4. Volunteer team SELECT policies (latest definitions: 0036). The All
--    members view loads both tables in full for its team filter.
-- ---------------------------------------------------------------------------

drop policy if exists "volunteer_teams_select_approved" on public.volunteer_teams;
create policy "volunteer_teams_select_approved" on public.volunteer_teams
  for select to authenticated
  using ((select public.is_approved()));

drop policy if exists "member_volunteer_teams_select_approved" on public.member_volunteer_teams;
create policy "member_volunteer_teams_select_approved" on public.member_volunteer_teams
  for select to authenticated
  using ((select public.is_approved()));

commit;
