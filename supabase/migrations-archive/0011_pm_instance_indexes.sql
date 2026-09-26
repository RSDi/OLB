-- 0011_pm_instance_indexes.sql
--
-- Tune pm_instances indexes for the queries the cron + UI actually run.
--
-- Existing index from 0008:
--   pm_instances_template_idx  (template_id, scheduled_for desc)
--     — leading column is right, but no query orders by scheduled_for desc.
--       Drop it.
--
-- Cron does two per-template lookups every run:
--   A) "Is there an open instance for this template?"
--      WHERE template_id = X AND deleted_at IS NULL
--            AND status IN ('pending','in_progress')
--   B) "When was this template last completed?"
--      WHERE template_id = X AND status = 'done'
--            AND completed_at IS NOT NULL
--      ORDER BY completed_at DESC LIMIT 1
--
-- The two partials below match those exactly. The asset detail page's
-- per-asset history is unaffected (it uses pm_instance_assets_asset_history_idx).
--
-- Idempotent.

begin;

drop index if exists public.pm_instances_template_idx;

create index if not exists pm_instances_template_status_active_idx
  on public.pm_instances (template_id, status)
  where deleted_at is null;

create index if not exists pm_instances_template_completed_idx
  on public.pm_instances (template_id, completed_at desc)
  where status = 'done' and completed_at is not null;

commit;
