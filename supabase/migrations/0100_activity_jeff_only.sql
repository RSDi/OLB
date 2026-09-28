-- 0100_activity_jeff_only.sql
--
-- Locks the activity trail (0099) to the accounts that can open the Activity
-- page, not every super-admin. The page itself is gated by the staged-rollout
-- list in lib/auth/feature-preview.ts; this is the same rule in the database,
-- so a super-admin who isn't on it can't read the data through the API
-- either.
--
-- can_see_activity(): an approved super-admin whose sign-in email is on the
-- list below. KEEP THE LIST IN STEP with FULL_UI_EMAILS in
-- lib/auth/feature-preview.ts. To give someone access later, add their email
-- here and re-run this function definition (or release Activity to every
-- super-admin by making it `select public.is_super_admin()`).
--
-- The summary views are security_invoker, so they follow these policies.
-- Writes are unaffected: only the server (service role) writes these tables.
--
-- Apply via the Supabase SQL editor, after 0099. Idempotent.

begin;

create or replace function public.can_see_activity()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_super_admin()
     and lower(coalesce(auth.jwt() ->> 'email', '')) in (
       'jeff@malone.net'
     )
$$;

revoke all on function public.can_see_activity() from public, anon;
grant execute on function public.can_see_activity() to authenticated;

drop policy if exists "activity_events_select_super" on public.activity_events;
drop policy if exists "activity_events_select_viewers" on public.activity_events;
create policy "activity_events_select_viewers" on public.activity_events
  for select to authenticated
  using ((select public.can_see_activity()));

drop policy if exists "member_previews_select_super" on public.member_previews;
drop policy if exists "member_previews_select_viewers" on public.member_previews;
create policy "member_previews_select_viewers" on public.member_previews
  for select to authenticated
  using ((select public.can_see_activity()));

commit;
