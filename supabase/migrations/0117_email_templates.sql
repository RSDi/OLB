-- 0117_email_templates.sql
--
-- Email templates: ready-made subjects and messages the board writes once in
-- Settings → Email Templates and picks from when emailing families (the
-- waitlist, 0115; the Directory and player pages, 0116). {player} in a
-- template becomes the family's player names when it sends.
--
-- slug marks a template the portal starts a message with: 'waitlist' is the
-- waitlist's "teams are full" message, added here with the wording the
-- waitlist used before, so the board can change it in Settings.
--
-- Access: any board member adds, edits and deletes templates. The board and
-- the Registrations permission (0102), who can email families, read them.
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0116. Idempotent: safe to run
-- again, and it adds the waitlist template only if there isn't one.

begin;

create table if not exists public.olb_email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  subject     text not null check (length(btrim(subject)) between 1 and 200),
  body        text not null check (length(btrim(body)) between 1 and 5000),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.olb_email_templates add column if not exists slug text;
create unique index if not exists olb_email_templates_slug_key
  on public.olb_email_templates (slug) where slug is not null;

alter table public.olb_email_templates enable row level security;

drop policy if exists "olb_email_templates_select" on public.olb_email_templates;
create policy "olb_email_templates_select" on public.olb_email_templates
  for select to authenticated
  using ((select public.is_staff()) or (select public.can_manage_registrations()));

drop policy if exists "olb_email_templates_insert_staff" on public.olb_email_templates;
create policy "olb_email_templates_insert_staff" on public.olb_email_templates
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists "olb_email_templates_update_staff" on public.olb_email_templates;
create policy "olb_email_templates_update_staff" on public.olb_email_templates
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "olb_email_templates_delete_staff" on public.olb_email_templates;
create policy "olb_email_templates_delete_staff" on public.olb_email_templates
  for delete to authenticated
  using ((select public.is_staff()));

insert into public.olb_email_templates (slug, name, subject, body)
select 'waitlist', 'Waitlist: teams are full', 'Your Omaha Lightning registration', $msg$Hi,

Thanks for registering {player} with Omaha Lightning Basketball. Our teams are full right now, so we've added {player} to our waitlist for the 2026-27 season. We'll be in touch as soon as a spot opens.

Questions? Just reply to this email.

Omaha Lightning Basketball$msg$
where not exists (select 1 from public.olb_email_templates where slug = 'waitlist');

notify pgrst, 'reload schema';

commit;
