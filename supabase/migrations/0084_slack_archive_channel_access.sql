-- 0084_slack_archive_channel_access.sql
--
-- Opens the Slack Archive (until now super-admin only) to every approved
-- member, while keeping private Slack channels — #building-committee,
-- #building-security, #churchdesign, … — visible only to the portal members
-- who are actually in that channel in Slack. Super admins still see every
-- channel. Covers messages, search, and the photo album alike: all of them
-- read slack_archive_messages through these policies.
--
-- Membership mirrors Slack. The sync (lib/slack-archive/sync.ts) asks Slack
-- whether each channel is private and, for private ones, who's in it,
-- matching Slack users to members by email, and writes the results here.
-- Nobody edits these by hand.
--
-- Fails closed: `is_private` starts NULL ("not confirmed with Slack yet")
-- and NULL is treated like private with no members, so a channel only
-- becomes visible to regular members once Slack has confirmed it's public.
-- A failed check (e.g. the bot lacks the channels:read / groups:read
-- scope) leaves the last confirmed values in place, never flips a channel
-- to public.
--
-- Depends on 0001/0049 (members, is_super_admin) and 0073
-- (members.access_revoked_at). Apply via the Supabase SQL editor.
-- Idempotent.

begin;

alter table public.slack_archive_channels
  add column if not exists is_private boolean,
  add column if not exists access_checked_at timestamptz,
  add column if not exists access_error text;

create table if not exists public.slack_archive_channel_members (
  channel_id text not null references public.slack_archive_channels(slack_channel_id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, member_id)
);
create index if not exists slack_archive_channel_members_member_idx
  on public.slack_archive_channel_members (member_id);

alter table public.slack_archive_channel_members enable row level security;

-- The Slack channel IDs the signed-in user may read. SECURITY DEFINER so it
-- can consult members / channel_members without those tables' own RLS
-- getting in the way (and without recursing into the channels policy that
-- calls it). Every policy below uses it as `x in (select …)`, which Postgres
-- evaluates once per query as a hashed subplan rather than once per row —
-- the same per-row pitfall 0080 fixed for is_super_admin().
create or replace function public.archive_visible_channel_ids()
returns setof text
language sql
security definer
stable
set search_path = public
as $$
  select c.slack_channel_id
  from public.slack_archive_channels c
  cross join lateral (
    select m.id, m.role, m.status, m.access_revoked_at
    from public.members m
    where m.user_id = auth.uid()
      and m.deleted_at is null
    limit 1
  ) me
  where me.role = 'super_admin'
     or (
       me.status = 'approved'
       and me.access_revoked_at is null
       and (
         c.is_private is false
         or exists (
           select 1
           from public.slack_archive_channel_members cm
           where cm.channel_id = c.slack_channel_id
             and cm.member_id = me.id
         )
       )
     )
$$;

revoke all on function public.archive_visible_channel_ids() from public;
grant execute on function public.archive_visible_channel_ids() to authenticated;

-- Replace the super-admin-only SELECT policies (0080). INSERT/UPDATE on the
-- channel registry stay super-admin only; messages, sync state, and
-- channel membership are still written only by the service role.
drop policy if exists "slack_archive_channels_select_super" on public.slack_archive_channels;
drop policy if exists "slack_archive_channels_select_visible" on public.slack_archive_channels;
create policy "slack_archive_channels_select_visible" on public.slack_archive_channels
  for select to authenticated
  using (slack_channel_id in (select public.archive_visible_channel_ids()));

drop policy if exists "slack_archive_messages_select_super" on public.slack_archive_messages;
drop policy if exists "slack_archive_messages_select_visible" on public.slack_archive_messages;
create policy "slack_archive_messages_select_visible" on public.slack_archive_messages
  for select to authenticated
  using (channel_id in (select public.archive_visible_channel_ids()));

drop policy if exists "slack_archive_sync_state_select_super" on public.slack_archive_sync_state;
drop policy if exists "slack_archive_sync_state_select_visible" on public.slack_archive_sync_state;
create policy "slack_archive_sync_state_select_visible" on public.slack_archive_sync_state
  for select to authenticated
  using (channel_id in (select public.archive_visible_channel_ids()));

drop policy if exists "slack_archive_channel_members_select_super" on public.slack_archive_channel_members;
create policy "slack_archive_channel_members_select_super" on public.slack_archive_channel_members
  for select to authenticated
  using ((select public.is_super_admin()));

commit;
