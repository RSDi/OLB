-- 0175_slack_auto_channels.sql
--
-- Slack channels for new families. Once a parent of an approved family has
-- joined Slack (the daily check in olb_onboarding_slack), the club's bot adds
-- them to their player's team channel and to the channels every family gets
-- (#lightning-family, #photos-videos). Off until someone turns it on in
-- Settings → Registration Automations; "Add to Slack channels" on the
-- Onboarding tab does the same by hand.
--
--   olb_onboarding_settings.slack_auto_channels   the switch
--   olb_onboarding_settings.slack_channels        the channels every family
--                                                 gets: [{ "id", "name" }]
--   olb_teams.slack_channel_id                    the team's own channel; when
--                                                 blank, its film channel (0148)
--   olb_onboarding_slack_channels                 who has been added where, so
--                                                 nobody is added twice, and
--                                                 what Slack said when it failed

alter table public.olb_onboarding_settings
  add column if not exists slack_auto_channels boolean not null default false,
  add column if not exists slack_channels      jsonb   not null default '[]'::jsonb;

alter table public.olb_teams
  add column if not exists slack_channel_id text;

create table if not exists public.olb_onboarding_slack_channels (
  slack_user_id text        not null,
  channel_id    text        not null,
  email         text        check (email is null or email = lower(email)),
  added_at      timestamptz,
  error         text,
  tried_at      timestamptz not null default now(),
  primary key (slack_user_id, channel_id)
);

alter table public.olb_onboarding_slack_channels enable row level security;

-- Service role only: the portal reads and writes it through
-- createAdminClient() after checking the Registrations permission.
grant select, insert, update, delete on public.olb_onboarding_slack_channels to service_role;
