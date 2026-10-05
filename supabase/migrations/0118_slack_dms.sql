-- 0118_slack_dms.sql
--
-- Slack DMs: messaging families from the Directory as yourself in Slack, one
-- direct message per person, instead of an email from the club.
--
--   members.can_slack_dm        a grant a super-admin gives in Settings →
--                               Members (Manages: Slack DMs). Any approved
--                               member can hold it: board members, coaches,
--                               the travel coordinator. Super-admins always
--                               can. Holders DM the families of the players
--                               they can already see in the Directory.
--   member_slack_connections    each holder's own Slack user token, from
--                               "Connect Slack" (/api/slack/connect), so a DM
--                               comes from them, not the club's bot. Read and
--                               written only by the server (service role): no
--                               policies, so no signed-in user can read a
--                               token, their own included.
--   olb_player_messages.via     'email' (0116) or 'slack'. Slack DMs are kept
--                               on the player's page like emails, and the
--                               grant reads and adds them.
--
-- The grant holder also reads the board's email templates (0117), to start a
-- DM from one.
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0117. Idempotent.

begin;

-- ─── The grant ──────────────────────────────────────────────────────────────

alter table public.members
  add column if not exists can_slack_dm boolean not null default false;

create or replace function public.can_slack_dm()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select m.status = 'approved' and (m.role = 'super_admin' or m.can_slack_dm)
      from public.members m
     where m.user_id = auth.uid()
       and m.deleted_at is null
  ), false)
$$;

revoke all on function public.can_slack_dm() from public, anon;
grant execute on function public.can_slack_dm() to authenticated;

-- Only a super-admin (or the server) may give or take a grant. 0110's
-- version with can_slack_dm added.
create or replace function public.guard_member_privilege_changes()
returns trigger
language plpgsql
as $$
begin
  -- Trusted backend (service key) and super-admins may change anything.
  if coalesce(current_setting('role', true), '') = 'service_role' then
    return new;
  end if;
  if public.is_super_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       or new.can_edit_settings is distinct from old.can_edit_settings
       or new.can_delete_settings is distinct from old.can_delete_settings
       or new.can_undelete_settings is distinct from old.can_undelete_settings
       or new.can_manage_finances is distinct from old.can_manage_finances
       or new.can_manage_registrations is distinct from old.can_manage_registrations
       or new.can_manage_travel is distinct from old.can_manage_travel
       or new.can_slack_dm is distinct from old.can_slack_dm then
      raise exception 'Only a super-admin can change a member''s role or settings grants';
    end if;
  elsif tg_op = 'INSERT' then
    if new.role <> 'member'
       or new.can_edit_settings
       or new.can_delete_settings
       or new.can_undelete_settings
       or new.can_manage_finances
       or new.can_manage_registrations
       or new.can_manage_travel
       or new.can_slack_dm then
      raise exception 'Only a super-admin can create a member with a role or settings grants';
    end if;
  end if;

  return new;
end
$$;

-- ─── Each sender's Slack connection ─────────────────────────────────────────

create table if not exists public.member_slack_connections (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  slack_user_id  text not null,
  slack_team_id  text not null,
  slack_name     text,
  access_token   text not null,
  scopes         text not null default '',
  connected_at   timestamptz not null default now()
);

-- Server only: RLS on and no policies.
alter table public.member_slack_connections enable row level security;
revoke all on public.member_slack_connections from anon, authenticated;

-- ─── DMs kept with the emails ───────────────────────────────────────────────

alter table public.olb_player_messages
  add column if not exists via text not null default 'email';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'olb_player_messages_via_check'
       and conrelid = 'public.olb_player_messages'::regclass
  ) then
    alter table public.olb_player_messages
      add constraint olb_player_messages_via_check check (via in ('email', 'slack'));
  end if;
end;
$$;

drop policy if exists "olb_player_messages_select" on public.olb_player_messages;
create policy "olb_player_messages_select" on public.olb_player_messages
  for select to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_registrations())
    or (select public.can_slack_dm())
  );

-- Email (0116) as before; a Slack DM by whoever holds the grant.
drop policy if exists "olb_player_messages_insert" on public.olb_player_messages;
create policy "olb_player_messages_insert" on public.olb_player_messages
  for insert to authenticated
  with check (
    sent_by = (select auth.uid())
    and (
      (via = 'email' and ((select public.is_staff()) or (select public.can_manage_registrations())))
      or (via = 'slack' and (select public.can_slack_dm()))
    )
  );

drop policy if exists "olb_email_templates_select" on public.olb_email_templates;
create policy "olb_email_templates_select" on public.olb_email_templates
  for select to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_registrations())
    or (select public.can_slack_dm())
  );

notify pgrst, 'reload schema';

commit;
