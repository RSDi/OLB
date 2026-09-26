-- 0086_rls_perf_remaining_tables.sql
--
-- Finishes what 0080 (Slack archive) and 0085 (directory) started: every
-- remaining RLS policy that calls a role helper bare — `public.is_staff()`,
-- `public.is_super_admin()`, `public.is_approved()`, or `auth.uid()` — gets
-- the call wrapped as `(select …)`. A bare call is re-run for EVERY row a
-- query touches (and each helper does its own lookup against members); the
-- wrapped form is evaluated once per query as an InitPlan. See "Call
-- functions with SELECT" in Supabase's RLS performance guidance. That covers
-- tasks, comments, events, playbooks, PM, assets, supplies, contacts,
-- closures, ReelNotes, settings tables, … — 157 policies on 35 tables in a
-- replay of this folder's migrations.
--
-- Rather than retyping all of those policies (and silently overwriting any
-- that have drifted from this folder's history), this rewrites each one IN
-- PLACE from its live definition:
--
--   1. Deparse the policy's USING / WITH CHECK with an empty search_path, so
--      every function comes out schema-qualified (the same trick pg_dump uses
--      to make pg_get_expr output safe to feed back in).
--   2. Wrap each bare helper call: `public.is_staff()` becomes
--      `(SELECT public.is_staff())`. Calls already wrapped are left alone
--      (Postgres deparses them as `( SELECT public.is_staff() AS is_staff)`,
--      so a negative lookbehind on "SELECT " skips them), which also makes
--      this safe to re-run.
--   3. `ALTER POLICY … USING (…) WITH CHECK (…)` with the result. ALTER keeps
--      the policy's name, command, roles and permissive/restrictive mode, so
--      the only change is when the helpers are evaluated, not what they
--      decide: each helper is STABLE and ignores the row, so its value is the
--      same for every row of a statement.
--
-- Verified on a local replay of every migration plus seeded data: row
-- visibility identical for 10 personas across all 39 RLS tables, and the
-- same allow/deny (and rows affected) for 20 write probes per persona. As
-- staff, the tasks list went from ~14ms to ~1.5ms of database time, events
-- ~4ms to ~1ms, ReelNotes action items ~7ms to ~1ms — on top of what 0085's
-- members.user_id index already saved, and growing with table size.
--
-- Row-dependent calls such as `public.owns_task(parent_id)` genuinely need
-- per-row evaluation and are not touched. Only the public schema is changed
-- (storage.objects' few write policies aren't read in bulk).
--
-- Preview before applying — this lists every policy that will change, with
-- its current and rewritten expressions:
--
--   set search_path = '';
--   select tablename, policyname, cmd,
--          qual, regexp_replace(qual, p, '(SELECT \1)', 'g') as new_qual,
--          with_check, regexp_replace(with_check, p, '(SELECT \1)', 'g') as new_with_check
--   from pg_policies,
--        (select '(?<!SELECT )((?:public\.is_(?:staff|super_admin|approved)|auth\.uid)\(\))'::text as p) x
--   where schemaname = 'public' and (qual ~ p or with_check ~ p)
--   order by tablename, policyname;
--   reset search_path;
--
-- Going forward, write new policies with the helper wrapped from the start:
-- `using ((select public.is_staff()))`.
--
-- Depends on 0001/0049 (the helpers). Idempotent; safe to re-run.

begin;

do $$
declare
  -- A bare call to one of the row-independent helpers, i.e. not already
  -- preceded by "SELECT " (the deparsed form of a wrapped call).
  bare_call constant text :=
    '(?<!SELECT )((?:public\.is_(?:staff|super_admin|approved)|auth\.uid)\(\))';
  r record;
  stmt text;
begin
  -- Schema-qualify everything pg_policies deparses (see step 1 above). Local
  -- to this transaction.
  perform set_config('search_path', '', true);

  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and (qual ~ bare_call or with_check ~ bare_call)
    order by tablename, policyname
  loop
    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then
      stmt := stmt || format(' using (%s)', regexp_replace(r.qual, bare_call, '(SELECT \1)', 'g'));
    end if;
    if r.with_check is not null then
      stmt := stmt || format(' with check (%s)', regexp_replace(r.with_check, bare_call, '(SELECT \1)', 'g'));
    end if;
    execute stmt;
  end loop;
end $$;

commit;
