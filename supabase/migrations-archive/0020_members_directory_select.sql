-- 0020_members_directory_select.sql
--
-- Lets approved members read other approved members' rows so the directory
-- at /portal/directory has something to show.
--
-- Existing policies (from 0001) stay in place:
--   - members_self_select       — every signed-in user reads their own row
--   - members_staff_select_all  — staff reads everyone (pending queue still works)
--
-- New policy below is additive: approved members get read access to other
-- approved members' rows. Pending/denied rows remain visible only to staff
-- and to the row's owner — they don't leak into the directory.
--
-- Depends on 0001 (members.role + RLS) and 0019 (is_approved helper).

begin;

drop policy if exists "members_directory_select" on public.members;

create policy "members_directory_select" on public.members
  for select to authenticated
  using (
    status = 'approved'
    and public.is_approved()
  );

commit;
