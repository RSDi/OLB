-- 0159_game_film_youtube_resume.sql
--
-- YouTube resumable uploads: keep the session URI across transient 5xx/429
-- errors, back off between cron ticks (next_attempt_at), and lease a job
-- for the current tick (claimed_until) so the next minute can continue
-- instead of waiting four minutes after every successful chunk window.
--
-- Additive only. game_film_youtube_jobs stays service-role-only so coaches
-- cannot read the resumable session URI. No new tables, sequences, or
-- functions — no Data API GRANT required.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0158. Idempotent.
--
-- Apply BEFORE deploying the matching app code so the lease and
-- between-tick backoff persist. The worker still runs if these columns
-- are missing (in-tick retry still works; lease/backoff writes are
-- skipped until this file is applied).

begin;

alter table public.game_film_youtube_jobs
  add column if not exists next_attempt_at timestamptz,
  add column if not exists claimed_until timestamptz;

notify pgrst, 'reload schema';

commit;
