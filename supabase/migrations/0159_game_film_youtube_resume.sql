-- 0159_game_film_youtube_resume.sql
--
-- YouTube resumable uploads: keep the session URI across transient 5xx/429
-- errors, back off between cron ticks (next_attempt_at), lease a job for
-- the current tick (claimed_until + claimed_by so only the owner can
-- release), and cap silent transient retries (transient_attempts).
--
-- Additive only. game_film_youtube_jobs stays service-role-only so coaches
-- cannot read the resumable session URI. No new tables, sequences, or
-- functions — no Data API GRANT required.
--
-- OLB does NOT auto-run migrations. Apply this in the Supabase SQL editor
-- after 0158. Idempotent.
--
-- Apply BEFORE deploying the matching app code. The worker fails closed
-- without these columns: it keeps the old 4-minute youtube_updated_at
-- stale gate and will not treat a missing lease as "free to claim."

begin;

alter table public.game_film_youtube_jobs
  add column if not exists next_attempt_at timestamptz,
  add column if not exists claimed_until timestamptz,
  add column if not exists claimed_by text,
  add column if not exists transient_attempts integer not null default 0;

notify pgrst, 'reload schema';

commit;
