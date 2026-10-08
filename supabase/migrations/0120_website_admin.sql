-- 0120_website_admin.sql
--
-- Settings → Website: editing the public club website from the portal.
--
--   members.can_manage_website  a grant a super-admin gives a board member in
--                               Settings → Members (Settings: Website).
--                               Super-admins always have it.
--   site_menu_items             the public site's top menu. Top-level items
--                               are links or folders; a folder's children are
--                               links. While the table is empty the site shows
--                               the menu built into the code, so nothing
--                               changes until someone saves one.
--   site_content                one row per edited spot on a public page
--                               (lib/website/slots.ts names them). A spot with
--                               no row shows the words or picture built into
--                               the page; deleting a row puts it back.
--   site-images                 a public bucket for pictures uploaded for the
--                               public site.
--
-- Everyone, signed in or not, reads the menu, the content and the pictures:
-- they're the public website. Only the grant holder writes them.
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0119. Idempotent.

begin;

-- ─── The grant ──────────────────────────────────────────────────────────────

alter table public.members
  add column if not exists can_manage_website boolean not null default false;

-- A board member with the grant, or a super-admin. Mirrors canManageWebsite()
-- in lib/auth/permissions.ts.
create or replace function public.can_manage_website()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select m.status = 'approved'
           and (m.role = 'super_admin' or (m.role = 'admin' and m.can_manage_website))
      from public.members m
     where m.user_id = auth.uid()
       and m.deleted_at is null
  ), false)
$$;

revoke all on function public.can_manage_website() from public, anon;
grant execute on function public.can_manage_website() to authenticated;

-- Only a super-admin (or the server) may give or take a grant. 0118's
-- version with can_manage_website added.
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
       or new.can_slack_dm is distinct from old.can_slack_dm
       or new.can_manage_website is distinct from old.can_manage_website then
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
       or new.can_slack_dm
       or new.can_manage_website then
      raise exception 'Only a super-admin can create a member with a role or settings grants';
    end if;
  end if;

  return new;
end
$$;

-- ─── The menu ───────────────────────────────────────────────────────────────

create table if not exists public.site_menu_items (
  id          uuid primary key default gen_random_uuid(),
  -- Set on a folder's links; null on the top-level items.
  parent_id   uuid references public.site_menu_items(id) on delete cascade,
  label       text not null check (length(btrim(label)) between 1 and 40),
  -- A site page ("/coaches") or a web address. Null on a folder.
  href        text check (href is null or href ~ '^(/|https?://)'),
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create index if not exists site_menu_items_parent_idx on public.site_menu_items (parent_id, sort_order);

alter table public.site_menu_items enable row level security;
grant select on public.site_menu_items to anon, authenticated;
grant insert, update, delete on public.site_menu_items to authenticated;

drop policy if exists "site_menu_items_select_all" on public.site_menu_items;
create policy "site_menu_items_select_all" on public.site_menu_items
  for select to anon, authenticated
  using (true);

drop policy if exists "site_menu_items_write_website" on public.site_menu_items;
create policy "site_menu_items_write_website" on public.site_menu_items
  for all to authenticated
  using ((select public.can_manage_website()))
  with check ((select public.can_manage_website()));

-- Saves the whole menu at once, so the site never shows half of an edit.
-- `items` is [{label, href, children: [{label, href}]}], in order; an item
-- with children is a folder. An empty array clears the menu, which puts the
-- site back on the menu built into the code. Runs as the caller, so the
-- policy above decides who may.
create or replace function public.replace_site_menu(items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item   jsonb;
  child  jsonb;
  top_id uuid;
  i      integer := 0;
  j      integer;
begin
  if not (select public.can_manage_website()) then
    raise exception 'You don''t have permission to edit the website';
  end if;

  delete from public.site_menu_items where true;

  for item in select * from jsonb_array_elements(coalesce(items, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.site_menu_items (label, href, sort_order, updated_by)
    values (
      btrim(item->>'label'),
      case when jsonb_array_length(coalesce(item->'children', '[]'::jsonb)) > 0 then null else item->>'href' end,
      i * 10,
      auth.uid()
    )
    returning id into top_id;

    j := 0;
    for child in select * from jsonb_array_elements(coalesce(item->'children', '[]'::jsonb)) loop
      j := j + 1;
      insert into public.site_menu_items (parent_id, label, href, sort_order, updated_by)
      values (top_id, btrim(child->>'label'), child->>'href', j * 10, auth.uid());
    end loop;
  end loop;
end
$$;

revoke all on function public.replace_site_menu(jsonb) from public, anon;
grant execute on function public.replace_site_menu(jsonb) to authenticated;

-- ─── Page text and pictures ─────────────────────────────────────────────────

create table if not exists public.site_content (
  -- The spot's key from lib/website/slots.ts, e.g. 'home.welcome.title'.
  key         text primary key check (key ~ '^[a-z0-9_.-]+$'),
  -- Text or markdown; for a picture, JSON {url, width, height, alt}.
  value       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.site_content enable row level security;
grant select on public.site_content to anon, authenticated;
grant insert, update, delete on public.site_content to authenticated;

drop policy if exists "site_content_select_all" on public.site_content;
create policy "site_content_select_all" on public.site_content
  for select to anon, authenticated
  using (true);

drop policy if exists "site_content_write_website" on public.site_content;
create policy "site_content_write_website" on public.site_content
  for all to authenticated
  using ((select public.can_manage_website()))
  with check ((select public.can_manage_website()));

-- ─── Pictures ───────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-images',
  'site-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The bucket is public, so its files are served without a select policy.
drop policy if exists "site_images_insert_website" on storage.objects;
create policy "site_images_insert_website" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-images' and (select public.can_manage_website()));

drop policy if exists "site_images_update_website" on storage.objects;
create policy "site_images_update_website" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-images' and (select public.can_manage_website()))
  with check (bucket_id = 'site-images' and (select public.can_manage_website()));

drop policy if exists "site_images_delete_website" on storage.objects;
create policy "site_images_delete_website" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-images' and (select public.can_manage_website()));

commit;
