-- 0098_player_requirements.sql
--
-- Player requirements: things every player (or a chosen team) has to hand in
-- or pay, tracked per player. The first is the handbook signature page,
-- signed by the player and a parent; a tournament fee or a form can be added
-- later from Settings → Requirements without a code change.
--
--   olb_requirements         the list, managed in Settings by super-admins and
--                            board members with the "Can edit settings" grant.
--                            team_ids null = every player; otherwise only
--                            players on those teams. Retired ones (active =
--                            false) keep their history but leave the Directory.
--   olb_player_requirements  one row per player per requirement once it's been
--                            handled: done (or paid) or waived. No row =
--                            still missing. Players are one row per season, so
--                            a new season starts everyone at missing.
--   player-requirement-files a private bucket for an optional scan of what
--                            was collected, keyed <player>/<requirement>/<file>.
--
-- Only the board (staff) can see or mark any of it; parents can't read fee
-- notes or scans.
--
-- Apply via the Supabase SQL editor, after 0097. Idempotent.

begin;

create table if not exists public.olb_requirements (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 60),
  description   text,
  kind          text not null default 'task' check (kind in ('task', 'fee')),
  amount_cents  int check (amount_cents is null or amount_cents >= 0),
  allow_file    boolean not null default false,
  due_on        date,
  team_ids      uuid[],
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint olb_requirements_amount_is_for_fees check (kind = 'fee' or amount_cents is null)
);

create index if not exists olb_requirements_sort_idx on public.olb_requirements (sort_order, name);

drop trigger if exists olb_requirements_set_updated_at on public.olb_requirements;
create trigger olb_requirements_set_updated_at
  before update on public.olb_requirements
  for each row execute function public.set_updated_at();

alter table public.olb_requirements enable row level security;

drop policy if exists "olb_requirements_select_staff" on public.olb_requirements;
create policy "olb_requirements_select_staff" on public.olb_requirements
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "olb_requirements_insert_settings" on public.olb_requirements;
create policy "olb_requirements_insert_settings" on public.olb_requirements
  for insert to authenticated
  with check ((select public.can_edit_settings()));

-- Deleting is a soft delete (deleted_at), so the delete grant needs update too.
drop policy if exists "olb_requirements_update_settings" on public.olb_requirements;
create policy "olb_requirements_update_settings" on public.olb_requirements
  for update to authenticated
  using ((select public.can_edit_settings()) or (select public.can_delete_settings()))
  with check ((select public.can_edit_settings()) or (select public.can_delete_settings()));

drop policy if exists "olb_requirements_delete_super" on public.olb_requirements;
create policy "olb_requirements_delete_super" on public.olb_requirements
  for delete to authenticated
  using ((select public.is_super_admin()));

create table if not exists public.olb_player_requirements (
  player_id       uuid not null references public.olb_players(id) on delete cascade,
  requirement_id  uuid not null references public.olb_requirements(id) on delete cascade,
  status          text not null default 'done' check (status in ('done', 'waived')),
  completed_on    date not null default current_date,
  note            text,
  file_path       text,
  file_name       text,
  marked_by       uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (player_id, requirement_id)
);

create index if not exists olb_player_requirements_requirement_idx
  on public.olb_player_requirements (requirement_id);

drop trigger if exists olb_player_requirements_set_updated_at on public.olb_player_requirements;
create trigger olb_player_requirements_set_updated_at
  before update on public.olb_player_requirements
  for each row execute function public.set_updated_at();

alter table public.olb_player_requirements enable row level security;

drop policy if exists "olb_player_requirements_staff_all" on public.olb_player_requirements;
create policy "olb_player_requirements_staff_all" on public.olb_player_requirements
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Scans of what was collected. Private: opened through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-requirement-files',
  'player-requirement-files',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "player_requirement_files_select_staff" on storage.objects;
create policy "player_requirement_files_select_staff" on storage.objects
  for select to authenticated
  using (bucket_id = 'player-requirement-files' and (select public.is_staff()));

drop policy if exists "player_requirement_files_insert_staff" on storage.objects;
create policy "player_requirement_files_insert_staff" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-requirement-files' and (select public.is_staff()));

drop policy if exists "player_requirement_files_update_staff" on storage.objects;
create policy "player_requirement_files_update_staff" on storage.objects
  for update to authenticated
  using (bucket_id = 'player-requirement-files' and (select public.is_staff()))
  with check (bucket_id = 'player-requirement-files' and (select public.is_staff()));

drop policy if exists "player_requirement_files_delete_staff" on storage.objects;
create policy "player_requirement_files_delete_staff" on storage.objects
  for delete to authenticated
  using (bucket_id = 'player-requirement-files' and (select public.is_staff()));

-- The first requirement: the handbook's signature page.
insert into public.olb_requirements (name, description, kind, allow_file, sort_order)
select 'Handbook signature',
       'Last page of the handbook, signed by the player and a parent.',
       'task', true, 10
where not exists (
  select 1 from public.olb_requirements where lower(name) = 'handbook signature' and deleted_at is null
);

commit;
