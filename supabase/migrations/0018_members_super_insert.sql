-- 0018_members_super_insert.sql
--
-- Adds an INSERT policy so super-admins can create members directly. The
-- pre-existing members_self_insert policy (from 0001) requires
-- `user_id = auth.uid()`, which blocks super-admins from pre-creating
-- directory entries (no user_id at all) or invited members (user_id NULL
-- until first sign-in).
--
-- FK constraints on user_id (auth.users) still apply, so this can't be used
-- to forge ownership of an arbitrary auth user.
--
-- Idempotent.

begin;

drop policy if exists "members_super_insert" on public.members;

create policy "members_super_insert" on public.members
  for insert to authenticated
  with check (public.is_super_admin());

commit;
