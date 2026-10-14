-- 0135_hs_hotel_stays.sql
--
-- Hotel stays for travel weekends: each stay is one hotel booking for one HS
-- Schedule weekend (Regionals, Nationals, a Saturday away), linked to the
-- External Contact that is the hotel, with booking instructions and a
-- per-player Booked checklist for the travel coordinator (0134 gave Travel
-- Directory chips for a single season-wide "Hotel registration"; this replaces
-- that with one stay per event).
--
--   hs_hotel_stays          the stay: weekend + hotel contact + instructions
--   hs_hotel_stay_players   Booked / waived per player (no row = missing)
--
-- The season-wide Hotel registration requirement is retired (active = false)
-- so Directory chips come from stays instead.
--
-- Apply via the Supabase SQL editor, after 0134. Idempotent.

begin;

create table if not exists public.hs_hotel_stays (
  id                     uuid primary key default gen_random_uuid(),
  weekend_id             uuid not null references public.hs_weekends(id) on delete cascade,
  hotel_contact_id       uuid not null references public.contacts(id) on delete restrict,
  name                   text not null check (length(btrim(name)) between 1 and 80),
  -- null team_ids = every player; otherwise only players on those Directory teams.
  team_ids               uuid[],
  booking_instructions   text,
  booking_url            text check (booking_url is null or length(btrim(booking_url)) between 1 and 500),
  booking_code           text check (booking_code is null or length(btrim(booking_code)) between 1 and 80),
  cutoff_on              date,
  rate_notes             text,
  status                 text not null default 'open'
                           check (status in ('draft', 'open', 'closed', 'canceled')),
  sort_order             int not null default 0,
  created_by             uuid references auth.users(id) on delete set null,
  updated_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (weekend_id, hotel_contact_id)
);

create index if not exists hs_hotel_stays_weekend_idx on public.hs_hotel_stays (weekend_id);
create index if not exists hs_hotel_stays_hotel_idx on public.hs_hotel_stays (hotel_contact_id);
create index if not exists hs_hotel_stays_status_idx on public.hs_hotel_stays (status);

drop trigger if exists hs_hotel_stays_set_updated_at on public.hs_hotel_stays;
create trigger hs_hotel_stays_set_updated_at
  before update on public.hs_hotel_stays
  for each row execute function public.set_updated_at();

comment on table public.hs_hotel_stays is
  'A hotel booking for one HS Schedule weekend: the hotel contact, how to book, and who it covers.';

create table if not exists public.hs_hotel_stay_players (
  stay_id       uuid not null references public.hs_hotel_stays(id) on delete cascade,
  player_id     uuid not null references public.olb_players(id) on delete cascade,
  status        text not null default 'done' check (status in ('done', 'waived')),
  completed_on  date not null default current_date,
  note          text,
  marked_by     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (stay_id, player_id)
);

create index if not exists hs_hotel_stay_players_player_idx
  on public.hs_hotel_stay_players (player_id);

drop trigger if exists hs_hotel_stay_players_set_updated_at on public.hs_hotel_stay_players;
create trigger hs_hotel_stay_players_set_updated_at
  before update on public.hs_hotel_stay_players
  for each row execute function public.set_updated_at();

alter table public.hs_hotel_stays enable row level security;
alter table public.hs_hotel_stay_players enable row level security;

-- Read: board, coaches (schedule planners), and Travel.
drop policy if exists "hs_hotel_stays_select" on public.hs_hotel_stays;
create policy "hs_hotel_stays_select" on public.hs_hotel_stays
  for select to authenticated
  using (
    (select public.can_plan_hs_schedule())
    or (select public.can_manage_travel())
  );

-- Write: board/staff or Travel (Travel owns the stay even when the weekend is view-only).
drop policy if exists "hs_hotel_stays_insert" on public.hs_hotel_stays;
create policy "hs_hotel_stays_insert" on public.hs_hotel_stays
  for insert to authenticated
  with check (
    (select public.is_staff())
    or (select public.can_manage_travel())
  );

drop policy if exists "hs_hotel_stays_update" on public.hs_hotel_stays;
create policy "hs_hotel_stays_update" on public.hs_hotel_stays
  for update to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_travel())
  )
  with check (
    (select public.is_staff())
    or (select public.can_manage_travel())
  );

drop policy if exists "hs_hotel_stays_delete" on public.hs_hotel_stays;
create policy "hs_hotel_stays_delete" on public.hs_hotel_stays
  for delete to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_travel())
  );

drop policy if exists "hs_hotel_stay_players_select" on public.hs_hotel_stay_players;
create policy "hs_hotel_stay_players_select" on public.hs_hotel_stay_players
  for select to authenticated
  using (
    (select public.can_plan_hs_schedule())
    or (select public.can_manage_travel())
    or (select public.can_check_requirements())
  );

drop policy if exists "hs_hotel_stay_players_all" on public.hs_hotel_stay_players;
create policy "hs_hotel_stay_players_all" on public.hs_hotel_stay_players
  for all to authenticated
  using (
    (select public.is_staff())
    or (select public.can_manage_travel())
  )
  with check (
    (select public.is_staff())
    or (select public.can_manage_travel())
  );

-- Season-wide Hotel registration from 0134: retire it; per-weekend stays replace it.
update public.olb_requirements
   set active = false,
       description = coalesce(
         description,
         'Replaced by hotel stays on each HS Schedule weekend (0135).'
       )
 where lower(name) = 'hotel registration'
   and deleted_at is null
   and active = true;

notify pgrst, 'reload schema';

commit;
