-- 0119_public_directory_link.sql
--
-- The public, read-only Directory's link: /directory/<key>. Anyone with the
-- link sees this season's players and parents without signing in, so the key
-- is the only thing standing in front of the page.
--
--   public_directory_link   one row. key null = the page is off. Super-admins
--                           set, change or clear it in Settings → Public
--                           Directory; changing it retires the old link.
--
-- Read and written only by the server (service role), behind a super-admin
-- check in lib/teams/public-directory-actions.ts: RLS is on with no
-- policies, so no signed-in member (or anyone else) can read the key
-- through the API.
--
-- Apply via the Supabase SQL editor, after 0118. Idempotent.

begin;

create table if not exists public.public_directory_link (
  id          boolean primary key default true check (id),
  key         text check (key is null or key ~ '^[A-Za-z0-9_-]{16,128}$'),
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.public_directory_link enable row level security;
revoke all on public.public_directory_link from anon, authenticated;

insert into public.public_directory_link (id) values (true) on conflict (id) do nothing;

commit;
