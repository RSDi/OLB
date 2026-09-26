-- 0071_recur_except_text.sql
--
-- events.recur_except stored skip DATES as a date[]. The repeating-skip feature
-- also stores rule entries in the same array — "rule:<week>:<weekday>" (e.g.
-- "rule:-1:0" = the last Sunday of every month) — which a date[] column rejects
-- with: invalid input syntax for type date: "rule:-1:0".
--
-- Widen the column to text[]. Existing dates cast cleanly to their ISO text form
-- ("2026-06-28"), and the app already reads/compares recur_except entries as
-- YYYY-MM-DD strings (lexicographic = chronological), so nothing else changes.
--
-- Idempotent: only alters while the column is still an array of dates (_date);
-- re-running after it's text[] is a no-op.

begin;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'events'
       and column_name = 'recur_except'
       and udt_name = '_date'
  ) then
    alter table public.events
      alter column recur_except type text[] using recur_except::text[];
  end if;
end $$;

commit;
