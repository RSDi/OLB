-- 0160_homepage_messages.sql
--
-- Settings → Messages: the optional box on the public Our Programs page
-- (the yellow hero, where the old black waitlist notice sat). One keyed
-- row for now (programs_hero). Off by default so the live page does not
-- change until someone with the Registrations permission turns it on.
--
-- Additive only. Does not change existing tables. Do not reuse
-- olb_registration_messages — that table (0115) is the waitlist email log.
--
-- Access: staff and Registrations can read. Writes go through the
-- service role after the app checks the Registrations permission. The
-- public page reads through the service role and hides the box when this
-- table is missing. Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0159. Idempotent.

begin;

create table if not exists public.olb_homepage_messages (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$' and length(key) between 1 and 40),
  enabled     boolean not null default false,
  body        text not null default '' check (length(body) <= 2000),
  link_text   text not null default '' check (length(link_text) <= 120),
  link_url    text not null default '' check (length(link_url) <= 500),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.olb_homepage_messages enable row level security;

revoke all on public.olb_homepage_messages from anon, authenticated;

drop policy if exists "olb_homepage_messages_select" on public.olb_homepage_messages;
create policy "olb_homepage_messages_select" on public.olb_homepage_messages
  for select to authenticated
  using ((select public.is_staff()) or (select public.can_manage_registrations()));

drop policy if exists "olb_homepage_messages_insert" on public.olb_homepage_messages;
drop policy if exists "olb_homepage_messages_update" on public.olb_homepage_messages;
drop policy if exists "olb_homepage_messages_delete" on public.olb_homepage_messages;

grant select on public.olb_homepage_messages to authenticated, service_role;
grant insert, update, delete on public.olb_homepage_messages to service_role;

-- Seed is off. The box already sits on Our Programs, so the link is the
-- 14U accordion on this page (#14u) — not a reload of /programs. Body
-- stops before the link words so they aren't repeated.
insert into public.olb_homepage_messages (key, enabled, body, link_text, link_url)
values (
  'programs_hero',
  false,
  'Now accepting two more 14U players. If your son is interested in being considered, sign up for an assessment below. Playing for Omaha Lightning is a commitment to a competitive team from October through February. Practices have already begun, so assessments will be scheduled right away.',
  'Practice times and payment info',
  '/programs#14u'
)
on conflict (key) do nothing;

notify pgrst, 'reload schema';

commit;
