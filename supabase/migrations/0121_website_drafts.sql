-- 0121_website_drafts.sql
--
-- Settings → Website, part 2: drafts, preview and publish.
--
--   site_drafts            what's been saved in Settings → Website but not
--                          published yet: one row per spot (key as in
--                          site_content), plus key 'menu' for the menu (a
--                          JSON array, as replace_site_menu takes it). A
--                          null value means "back to the original" once
--                          published. Only the Website grant reads or writes
--                          drafts: visitors never see them, and the preview
--                          reads them as the signed-in editor.
--   publish_site_drafts()  makes every draft live at once and clears them.
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0120. Idempotent.

begin;

create table if not exists public.site_drafts (
  key         text primary key check (key ~ '^[a-z0-9_.-]+$'),
  value       text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.site_drafts enable row level security;
revoke all on public.site_drafts from anon;
grant select, insert, update, delete on public.site_drafts to authenticated;

drop policy if exists "site_drafts_website" on public.site_drafts;
create policy "site_drafts_website" on public.site_drafts
  for all to authenticated
  using ((select public.can_manage_website()))
  with check ((select public.can_manage_website()));

-- Publishes every draft in one go, so the site never shows half of them.
-- Runs as the caller, so the policies decide who may.
create or replace function public.publish_site_drafts()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  d record;
  n integer := 0;
begin
  if not (select public.can_manage_website()) then
    raise exception 'You don''t have permission to edit the website';
  end if;

  for d in select key, value from public.site_drafts order by key for update loop
    n := n + 1;
    if d.key = 'menu' then
      perform public.replace_site_menu(coalesce(d.value::jsonb, '[]'::jsonb));
    elsif d.value is null then
      delete from public.site_content where key = d.key;
    else
      insert into public.site_content (key, value, updated_at, updated_by)
      values (d.key, d.value, now(), auth.uid())
      on conflict (key) do update
        set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
    end if;
  end loop;

  delete from public.site_drafts where true;
  return n;
end
$$;

revoke all on function public.publish_site_drafts() from public, anon;
grant execute on function public.publish_site_drafts() to authenticated;

commit;
