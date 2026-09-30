-- 0102_registrations_grant.sql
--
-- The Registrations permission. The Teams section folds into the Directory,
-- and this lets people besides super-admins run it.
--
--   members.can_manage_registrations  a grant a super-admin gives in
--                         Settings → Members. Holders review registrations
--                         from the public form (Approve / Not this season),
--                         put players on teams, edit a player's name,
--                         birthday, jersey number and age group, and take a
--                         player off the roster. Any approved member can hold
--                         it, board or not. Super-admins always can.
--
-- Access for holders (super-admins keep 0089's <table>_super_all):
--   - olb_registrations: read and update (approve, not this season);
--   - olb_players: read every player on the board, including families who
--     opted out of the Directory (they still need a team), and update. A
--     player can only be put on a team on their own board. No insert or
--     delete policy: Approve adds players on the server after reading the
--     registration under this policy (lib/teams/registration-actions.ts),
--     and remove_olb_player() takes one off.
-- Parent links and parents already follow player visibility (0090, 0091).
--
-- remove_olb_player(id) takes a player off the roster. A player with money
-- still on their account (a charge or payment that isn't voided) stays until
-- the Treasurer voids it. Their voided lines go with them.
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0101. Idempotent.

begin;

alter table public.members
  add column if not exists can_manage_registrations boolean not null default false;

create or replace function public.can_manage_registrations()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select m.status = 'approved' and (m.role = 'super_admin' or m.can_manage_registrations)
      from public.members m
     where m.user_id = auth.uid()
       and m.deleted_at is null
  ), false)
$$;

revoke all on function public.can_manage_registrations() from public, anon;
grant execute on function public.can_manage_registrations() to authenticated;

-- Only a super-admin (or the server) may give or take the grant. Replaces
-- 0101's version with can_manage_registrations added.
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
       or new.can_manage_registrations is distinct from old.can_manage_registrations then
      raise exception 'Only a super-admin can change a member''s role or settings grants';
    end if;
  elsif tg_op = 'INSERT' then
    if new.role <> 'member'
       or new.can_edit_settings
       or new.can_delete_settings
       or new.can_undelete_settings
       or new.can_manage_finances
       or new.can_manage_registrations then
      raise exception 'Only a super-admin can create a member with a role or settings grants';
    end if;
  end if;

  return new;
end
$$;

drop policy if exists "olb_registrations_registrar_select" on public.olb_registrations;
create policy "olb_registrations_registrar_select" on public.olb_registrations
  for select to authenticated
  using ((select public.can_manage_registrations()));

drop policy if exists "olb_registrations_registrar_update" on public.olb_registrations;
create policy "olb_registrations_registrar_update" on public.olb_registrations
  for update to authenticated
  using ((select public.can_manage_registrations()))
  with check ((select public.can_manage_registrations()));

drop policy if exists "olb_players_registrar_select" on public.olb_players;
create policy "olb_players_registrar_select" on public.olb_players
  for select to authenticated
  using ((select public.can_manage_registrations()));

drop policy if exists "olb_players_registrar_update" on public.olb_players;
create policy "olb_players_registrar_update" on public.olb_players
  for update to authenticated
  using ((select public.can_manage_registrations()))
  with check (
    (select public.can_manage_registrations())
    and (team_id is null
         or exists (select 1 from public.olb_teams t where t.id = team_id and t.board_id = olb_players.board_id))
  );

create or replace function public.remove_olb_player(p_player_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.can_manage_registrations() then
    raise exception 'Only someone with the Registrations permission can take a player off the roster';
  end if;
  if exists (select 1 from public.olb_charges where player_id = p_player_id and voided_at is null)
     or exists (select 1 from public.olb_payments where player_id = p_player_id and voided_at is null) then
    raise exception 'This player still has charges or payments. The Treasurer voids them on the Payments page first.';
  end if;
  delete from public.olb_charges where player_id = p_player_id;
  delete from public.olb_payments where player_id = p_player_id;
  delete from public.olb_players where id = p_player_id;
end
$$;

revoke all on function public.remove_olb_player(uuid) from public, anon;
grant execute on function public.remove_olb_player(uuid) to authenticated;

commit;
