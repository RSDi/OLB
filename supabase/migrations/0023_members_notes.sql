-- 0023_members_notes.sql
--
-- Staff-only freeform notes per member. Lives in its own table so the
-- members_directory_select policy from 0020 (which lets every approved
-- member read every approved row) can't leak private context like "prayer
-- request: cancer recovery" or "*need new address" to the whole church.
--
-- 1:1 with members. Cascade-deletes if the member is hard-deleted.
--
-- Depends on 0001 (is_staff helper) and 0017 (members table relaxed).

begin;

create table if not exists public.members_notes (
  member_id   uuid primary key references public.members(id) on delete cascade,
  notes       text not null default '',
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

-- updated_at maintained by the shared set_updated_at trigger from 0001.
drop trigger if exists members_notes_set_updated_at on public.members_notes;
create trigger members_notes_set_updated_at
  before update on public.members_notes
  for each row execute function public.set_updated_at();

alter table public.members_notes enable row level security;

-- Clear any prior policies so this migration is idempotent.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'members_notes'
  loop
    execute format('drop policy if exists %I on public.members_notes', r.policyname);
  end loop;
end $$;

create policy "members_notes_select_staff" on public.members_notes
  for select to authenticated
  using (public.is_staff());

create policy "members_notes_insert_staff" on public.members_notes
  for insert to authenticated
  with check (public.is_staff());

create policy "members_notes_update_staff" on public.members_notes
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "members_notes_delete_staff" on public.members_notes
  for delete to authenticated
  using (public.is_staff());

commit;
