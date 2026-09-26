-- 0059: playbooks as runnable procedures (Phase 1 of the shutdown wizard).
--
-- Any playbook can carry an ordered checklist (`steps`) + a Slack channel to
-- notify when someone finishes running it. That turns the doc into a guided
-- wizard — reusable for shutdown today and other procedures later. All optional
-- and nullable, so existing playbooks are unaffected. Idempotent.

alter table public.playbooks add column if not exists steps jsonb;
alter table public.playbooks add column if not exists wizard_slack_channel text;
alter table public.playbooks add column if not exists wizard_completion_message text;

-- steps shape: [{ "label": "Turn off both lobby HVAC units" }, ...] (ordered).
-- A playbook with a non-empty steps array is "runnable". wizard_slack_channel
-- (a Slack channel id) + wizard_completion_message are used to post an FYI when
-- a run completes.
