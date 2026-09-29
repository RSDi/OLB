-- 0101_olb_payments.sql
--
-- Payments: what each family owes the club for the season and what they've
-- paid, replacing the Treasurer's spreadsheet and Cognito's order totals.
--
--   members.can_manage_finances  a grant a super-admin gives in Settings →
--                         Members (the Treasurer first). Holders see every
--                         family's balance and record charges and payments.
--                         Any approved member can hold it, board or not.
--                         Super-admins always can.
--   olb_charges           one row per player per thing owed (kind 'charge':
--                         registration fee, uniform, tournament, a refund paid
--                         out) or taken off (kind 'credit': covered by the
--                         club after a board vote, scholarship, adjustment).
--   olb_payments          money received, one row per player it pays for. A
--                         family's single Venmo or check that covers three
--                         kids is three rows sharing a group_id, written in
--                         one insert so they land together.
--   olb_boards.parent_balances_visible
--                         off until the Treasurer has the books loaded; while
--                         off, parents see nothing. Changed only through
--                         set_parent_balances_visible().
--
-- A player's balance = charges − credits − payments. Nothing is edited or
-- deleted: a mistake is voided (voided_at) and entered again, so the history
-- stays. Players with money records can't be deleted (the player FKs have no
-- ON DELETE action); deleting a whole season board still clears everything.
--
-- Access:
--   - finance managers (can_manage_finances()) read and write all of it, and
--     read every player on the board, including families who opted out of
--     the Directory;
--   - parents read their own players' charges and payments (not voided) once
--     the board's parent_balances_visible is on. They also read their own
--     players' rows, whatever the Directory opt-in said.
-- Notes on charges and payments are visible to the family.
--
-- Helper calls are wrapped in (select …) per AGENTS.md; my_player_ids() and
-- my_billed_player_ids() are uncorrelated, so `x in (select …)` runs them once.
--
-- Apply via the Supabase SQL editor, after 0100. Idempotent.

begin;

-- ─── The grant ──────────────────────────────────────────────────────────────

alter table public.members
  add column if not exists can_manage_finances boolean not null default false;

create or replace function public.can_manage_finances()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select m.status = 'approved' and (m.role = 'super_admin' or m.can_manage_finances)
      from public.members m
     where m.user_id = auth.uid()
       and m.deleted_at is null
  ), false)
$$;

revoke all on function public.can_manage_finances() from public, anon;
grant execute on function public.can_manage_finances() to authenticated;

-- Only a super-admin (or the server) may give or take the grant, same as the
-- settings grants. Replaces 0058's version with can_manage_finances added.
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
       or new.can_manage_finances is distinct from old.can_manage_finances then
      raise exception 'Only a super-admin can change a member''s role or settings grants';
    end if;
  elsif tg_op = 'INSERT' then
    if new.role <> 'member'
       or new.can_edit_settings
       or new.can_delete_settings
       or new.can_undelete_settings
       or new.can_manage_finances then
      raise exception 'Only a super-admin can create a member with a role or settings grants';
    end if;
  end if;

  return new;
end;
$$;

-- ─── Whose players are mine ─────────────────────────────────────────────────

alter table public.olb_boards
  add column if not exists parent_balances_visible boolean not null default false;

-- The signed-in parent's players, on any board.
create or replace function public.my_player_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select pp.player_id
    from public.olb_player_parents pp
    join public.members m on m.id = pp.member_id
   where m.user_id = auth.uid()
     and m.status = 'approved'
     and m.deleted_at is null
     and m.access_revoked_at is null
$$;

-- The same, only on boards whose balances are open to parents.
create or replace function public.my_billed_player_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select p.id
    from public.olb_players p
    join public.olb_boards b on b.id = p.board_id
   where b.parent_balances_visible
     and p.id in (select public.my_player_ids())
$$;

revoke all on function public.my_player_ids() from public, anon;
revoke all on function public.my_billed_player_ids() from public, anon;
grant execute on function public.my_player_ids() to authenticated;
grant execute on function public.my_billed_player_ids() to authenticated;

-- ─── Parents' view switch ───────────────────────────────────────────────────

-- A finance manager turns parents' balances on or off. Finance managers get no
-- update policy on olb_boards, so this is the only way to change the flag.
create or replace function public.set_parent_balances_visible(p_board_id uuid, p_visible boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.can_manage_finances() then
    raise exception 'Only the Treasurer can change this';
  end if;
  update public.olb_boards set parent_balances_visible = p_visible where id = p_board_id;
end;
$$;

revoke all on function public.set_parent_balances_visible(uuid, boolean) from public, anon;
grant execute on function public.set_parent_balances_visible(uuid, boolean) to authenticated;

-- ─── Charges and credits ────────────────────────────────────────────────────

create table if not exists public.olb_charges (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.olb_boards(id) on delete cascade,
  player_id    uuid not null references public.olb_players(id),
  kind         text not null check (kind in ('charge', 'credit')),
  category     text not null,
  description  text not null check (length(btrim(description)) between 1 and 120),
  amount_cents int  not null check (amount_cents > 0),
  entry_date   date not null default current_date,
  note         text check (note is null or length(note) <= 500),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  voided_by    uuid references auth.users(id) on delete set null,
  constraint olb_charges_category_check check (
    (kind = 'charge' and category in ('registration', 'uniform', 'tournament', 'refund', 'other'))
    or (kind = 'credit' and category in ('covered', 'scholarship', 'adjustment'))
  )
);

create index if not exists olb_charges_board_idx  on public.olb_charges (board_id);
create index if not exists olb_charges_player_idx on public.olb_charges (player_id);

-- ─── Payments ───────────────────────────────────────────────────────────────

create table if not exists public.olb_payments (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.olb_boards(id) on delete cascade,
  group_id     uuid not null,                       -- one Venmo/check across players
  player_id    uuid not null references public.olb_players(id),
  amount_cents int  not null check (amount_cents > 0),
  paid_on      date not null default current_date,
  method       text not null check (method in ('venmo', 'check', 'cash', 'card', 'other')),
  reference    text check (reference is null or length(reference) <= 80),  -- check #, Venmo note
  note         text check (note is null or length(note) <= 500),
  recorded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  voided_by    uuid references auth.users(id) on delete set null
);

create index if not exists olb_payments_board_idx  on public.olb_payments (board_id);
create index if not exists olb_payments_player_idx on public.olb_payments (player_id);
create index if not exists olb_payments_group_idx  on public.olb_payments (group_id);

-- ─── Access ─────────────────────────────────────────────────────────────────

alter table public.olb_charges enable row level security;
alter table public.olb_payments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['olb_charges', 'olb_payments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_finance_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.can_manage_finances()))',
      t || '_finance_select', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_finance_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select public.can_manage_finances()))',
      t || '_finance_insert', t
    );
    -- Updates are for voiding. No delete policy: records are voided, never removed.
    execute format('drop policy if exists %I on public.%I', t || '_finance_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select public.can_manage_finances()))
         with check ((select public.can_manage_finances()))',
      t || '_finance_update', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_parent_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (voided_at is null and player_id in (select public.my_billed_player_ids()))',
      t || '_parent_select', t
    );
  end loop;
end $$;

-- Finance managers see every player on the board, opted out of the Directory
-- or not. Parents see their own players. Parent links follow player
-- visibility (0090's olb_player_parents_directory_select).
drop policy if exists "olb_players_finance_select" on public.olb_players;
create policy "olb_players_finance_select" on public.olb_players
  for select to authenticated
  using ((select public.can_manage_finances()));

drop policy if exists "olb_players_parent_select" on public.olb_players;
create policy "olb_players_parent_select" on public.olb_players
  for select to authenticated
  using (id in (select public.my_player_ids()));

commit;
