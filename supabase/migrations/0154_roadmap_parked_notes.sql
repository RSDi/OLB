-- 0154_roadmap_parked_notes.sql
--
-- Roadmap gains a Parked column (set aside, not in the pipeline) and an
-- append-only history of bot moves and notes. Status order on the board is
-- released / preview / progress / planned / proposed / parked. The Product
-- Manager bot may PATCH a card to any of those columns and attach a note.
--
--   olb_roadmap_items.status  adds 'parked' to the check (0129 / 0136).
--   olb_roadmap_events        one row per bot PATCH: who (always 'bot'),
--                             from_status, to_status, optional note, and
--                             when. Super-admins can read; nobody updates
--                             or deletes from the app. The bot writes with
--                             the service role (same as item PATCH).
--
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0153. Idempotent.

begin;

alter table public.olb_roadmap_items
  drop constraint if exists olb_roadmap_items_status_check;
alter table public.olb_roadmap_items
  add constraint olb_roadmap_items_status_check
    check (status in ('released', 'preview', 'progress', 'planned', 'proposed', 'parked'));

create table if not exists public.olb_roadmap_events (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.olb_roadmap_items(id) on delete cascade,
  actor        text not null check (actor = 'bot'),
  from_status  text not null check (from_status in ('released', 'preview', 'progress', 'planned', 'proposed', 'parked')),
  to_status    text not null check (to_status in ('released', 'preview', 'progress', 'planned', 'proposed', 'parked')),
  note         text check (note is null or char_length(note) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create index if not exists olb_roadmap_events_item_idx
  on public.olb_roadmap_events (item_id, created_at);

comment on table public.olb_roadmap_events is
  'Append-only history of Product Manager bot moves and notes on a roadmap card.';
comment on column public.olb_roadmap_events.actor is
  'Who made the change. The bot always writes ''bot''.';
comment on column public.olb_roadmap_events.from_status is
  'Column the card was in before the PATCH.';
comment on column public.olb_roadmap_events.to_status is
  'Column the card landed in. Same as from_status when the bot only left a note.';
comment on column public.olb_roadmap_events.note is
  'Optional note on the PATCH, trimmed, at most 2000 characters.';

alter table public.olb_roadmap_events enable row level security;

drop policy if exists "olb_roadmap_events_select" on public.olb_roadmap_events;
create policy "olb_roadmap_events_select" on public.olb_roadmap_events
  for select to authenticated
  using ((select public.is_super_admin()));

-- No insert / update / delete policies: the bot uses the service role, and
-- history is not editable from the portal.
grant select on public.olb_roadmap_events to authenticated, service_role;
grant insert, update, delete on public.olb_roadmap_events to service_role;

commit;

notify pgrst, 'reload schema';
