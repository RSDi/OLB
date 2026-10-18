-- 0140_age_eligibility.sql
--
-- Conqueror league age rule (Ted Smith via the league, #2026-board, 10/16/26):
-- a player at a level cannot turn older than that level's max age at any point
-- of the season, or they have to play up. 14U must not turn 15 on or before
-- the season end date; 12U must not turn 13; 10U must not turn 11.
--
-- Adds:
--   olb_boards.season_ends_on          per-season end date (first value 2026-12-31)
--   public.set_season_ends_on()        board (is_staff) write; boards have no
--                                      staff UPDATE policy (same pattern as 0101)
--   public.olb_age_caps                editable max-age table per season/level
--
-- Birthdates stay on olb_players.dob. Eligibility is computed in the app.
-- Caps and the setter are staff-only (members.role admin / super_admin via
-- is_staff() / is_super_admin()). Helper calls are wrapped in (select …)
-- per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0139. Idempotent. Do not rely on
-- automatic migrations.

begin;

alter table public.olb_boards
  add column if not exists season_ends_on date;

comment on column public.olb_boards.season_ends_on is
  'Last day of this season. A player ages out of a level if they turn (max_age + 1) on or before this date.';

update public.olb_boards
  set season_ends_on = '2026-12-31'
  where season_ends_on is null;

-- Board members have no UPDATE policy on olb_boards (0089 is super-admin
-- only). This is the only way they change the season end date.
create or replace function public.set_season_ends_on(p_board_id uuid, p_ends_on date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Board access required';
  end if;
  if p_ends_on is null then
    raise exception 'Season end date is required';
  end if;
  update public.olb_boards
     set season_ends_on = p_ends_on,
         updated_at = now()
   where id = p_board_id;
  if not found then
    raise exception 'Season not found';
  end if;
end
$$;

revoke all on function public.set_season_ends_on(uuid, date) from public, anon;
grant execute on function public.set_season_ends_on(uuid, date) to authenticated;

create table if not exists public.olb_age_caps (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.olb_boards(id) on delete cascade,
  age_group  text not null,
  max_age    integer not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, age_group),
  constraint olb_age_caps_age_group_check check (length(btrim(age_group)) between 1 and 20),
  constraint olb_age_caps_max_age_check check (max_age between 1 and 25)
);

create index if not exists olb_age_caps_board_idx on public.olb_age_caps (board_id, sort_order);

comment on table public.olb_age_caps is
  'Per-season age caps: max_age 14 on 14U means the player must not turn 15 on or before season_ends_on.';

alter table public.olb_age_caps enable row level security;

drop policy if exists "olb_age_caps_select" on public.olb_age_caps;
create policy "olb_age_caps_select" on public.olb_age_caps
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "olb_age_caps_insert" on public.olb_age_caps;
create policy "olb_age_caps_insert" on public.olb_age_caps
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists "olb_age_caps_update" on public.olb_age_caps;
create policy "olb_age_caps_update" on public.olb_age_caps
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "olb_age_caps_delete" on public.olb_age_caps;
create policy "olb_age_caps_delete" on public.olb_age_caps
  for delete to authenticated
  using ((select public.is_staff()));

-- Seed the usual U-levels for every season that has none yet.
-- 10U must not turn 11; 12U must not turn 13; 14U must not turn 15.
insert into public.olb_age_caps (board_id, age_group, max_age, sort_order)
select b.id, v.age_group, v.max_age, v.sort_order
  from public.olb_boards b
  cross join (
    values
      ('10U', 10, 10),
      ('12U', 12, 20),
      ('14U', 14, 30),
      ('16U', 16, 40),
      ('18U', 18, 50)
  ) as v(age_group, max_age, sort_order)
  where not exists (
    select 1 from public.olb_age_caps c where c.board_id = b.id
  );

commit;

notify pgrst, 'reload schema';
