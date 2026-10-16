-- 0138_release_notes.sql
--
-- Settings → Release Notes: dated entries the board reads, super-admins
-- write. Each note is a title, an area (same list as the roadmap), a
-- summary, and an optional "Show me how" walkthrough (ordered steps plus an
-- optional screenshot or video). A note may point at a released roadmap
-- item (olb_roadmap_items) so a live board card can feed a release note.
--
-- Access: signed-in staff (is_staff) read; super-admins insert and update
-- (soft-delete). Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0137. Idempotent.

begin;

create table if not exists public.olb_release_notes (
  id               uuid primary key default gen_random_uuid(),
  released_on      date not null,
  title            text not null check (char_length(title) between 1 and 120),
  area             text not null,
  summary          text not null check (char_length(summary) between 1 and 2000),
  steps            jsonb not null default '[]'::jsonb,
  media_url        text,
  href             text,
  roadmap_item_id  uuid references public.olb_roadmap_items(id) on delete set null,
  seed_key         text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint olb_release_notes_steps_array check (jsonb_typeof(steps) = 'array'),
  constraint olb_release_notes_media_len check (media_url is null or char_length(media_url) between 1 and 500),
  constraint olb_release_notes_href_len check (href is null or char_length(href) between 1 and 300)
);

create unique index if not exists olb_release_notes_seed_key
  on public.olb_release_notes (seed_key) where seed_key is not null;

create unique index if not exists olb_release_notes_roadmap_item_live
  on public.olb_release_notes (roadmap_item_id)
  where deleted_at is null and roadmap_item_id is not null;

create index if not exists olb_release_notes_live_idx
  on public.olb_release_notes (released_on desc, title) where deleted_at is null;

drop trigger if exists olb_release_notes_set_updated_at on public.olb_release_notes;
create trigger olb_release_notes_set_updated_at before update on public.olb_release_notes
  for each row execute function public.set_updated_at();

alter table public.olb_release_notes enable row level security;

drop policy if exists "olb_release_notes_select" on public.olb_release_notes;
create policy "olb_release_notes_select" on public.olb_release_notes
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "olb_release_notes_insert" on public.olb_release_notes;
create policy "olb_release_notes_insert" on public.olb_release_notes
  for insert to authenticated
  with check ((select public.is_super_admin()) and created_by = (select auth.uid()));

drop policy if exists "olb_release_notes_update" on public.olb_release_notes;
create policy "olb_release_notes_update" on public.olb_release_notes
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- 10/16 releases. Seed keys keep a re-run from duplicating them. Walkthrough
-- steps are the "Show me how" overlay; no screenshots shipped with the seed.

insert into public.olb_release_notes (
  seed_key, released_on, title, area, summary, href, steps
)
select
  '2026-10-16-hotel-staying-elsewhere',
  '2026-10-16',
  'Staying elsewhere and sibling marking',
  'HS Schedule',
  'Families who are accounted for but not booking the hotel block (for example staying with relatives) now have a clear Directory status, and one mark can cover siblings on the same stay. Waived is now Staying elsewhere; Booked is Booked in block; Missing is Not yet known. Staying elsewhere needs a note. When Travel marks Booked in block or Staying elsewhere, siblings on the same stay are ticked by default so one save covers them.',
  '/portal/directory',
  $json$[
    {"title":"Open the Directory","body":"Go to **Directory**. Hotel stays live on each player for the HS Schedule weekend the club is tracking.","href":"/portal/directory"},
    {"title":"Filter by stay status","body":"Use the hotel-stay chips: **Not yet known**, **Booked in block**, and **Staying elsewhere**. Counts follow those labels."},
    {"title":"Mark a player","body":"Tap a player to open the hotel-stay dialog. Pick **Staying elsewhere** (or **Booked in block**). **Staying elsewhere** needs a note, for example “staying with family”. The note shows on the chip."},
    {"title":"Cover siblings in one save","body":"The dialog lists siblings on the same stay, ticked by default. Untick any you don’t want marked. Save writes the same status, note and date to each ticked sibling. Clearing to **Not yet known** asks whether to clear the siblings too."}
  ]$json$::jsonb
where not exists (
  select 1 from public.olb_release_notes where seed_key = '2026-10-16-hotel-staying-elsewhere'
);

insert into public.olb_release_notes (
  seed_key, released_on, title, area, summary, href, steps
)
select
  '2026-10-16-hotel-covered-sibling',
  '2026-10-16',
  'Covered via sibling, and Travel sees every player',
  'HS Schedule',
  'A player with no hotel-stay row of their own now shows Covered via sibling when a sibling who shares a parent is Booked in block or Staying elsewhere on the same stay. They drop out of the Not yet known count. Travel can read every current-season player for hotel-stay tracking, including families who said no to the Directory.',
  '/portal/directory',
  $json$[
    {"title":"Open a hotel stay in the Directory","body":"Go to **Directory** and pick the stay you’re tracking. Players without their own mark used to count as **Not yet known**.","href":"/portal/directory"},
    {"title":"Covered via sibling","body":"If a brother or sister who shares a parent is **Booked in block** or **Staying elsewhere** on that stay, this player’s chip says **Covered via sibling · [name]**. They still show under **All**, but not under **Not yet known**."},
    {"title":"Travel’s roster","body":"With **Travel**, the Directory list, the counts and the sibling picker include every player on the latest season board — even families who said no to the Directory. Only Travel and the board can edit marks."}
  ]$json$::jsonb
where not exists (
  select 1 from public.olb_release_notes where seed_key = '2026-10-16-hotel-covered-sibling'
);

insert into public.olb_release_notes (
  seed_key, released_on, title, area, summary, href, steps
)
select
  '2026-10-16-roadmap-preview',
  '2026-10-16',
  'Roadmap Preview column',
  'Portal',
  'The roadmap board now has a Preview column between In progress and Released. An item in Preview carries a Vercel preview link. Super-admins can paste that link on the item, and the Product Manager bot can move an item one column forward (progress → preview needs the link; preview → released stamps the live date).',
  '/portal/roadmap',
  $json$[
    {"title":"Open the Roadmap","body":"Go to **Roadmap** in the sidebar (super-admins on the preview list). Columns now run **Released**, **Preview**, **In progress**, **Planned**, **Proposed**.","href":"/portal/roadmap"},
    {"title":"Preview items","body":"An item in **Preview** shows a Preview badge and an **Open preview** link that opens the Vercel preview in a new tab."},
    {"title":"Edit the preview link","body":"Open the item. Super-admins can edit **Preview link**. Moving an item into Preview requires that link; moving it to Released fills in the live date."}
  ]$json$::jsonb
where not exists (
  select 1 from public.olb_release_notes where seed_key = '2026-10-16-roadmap-preview'
);

insert into public.olb_release_notes (
  seed_key, released_on, title, area, summary, href, steps
)
select
  '2026-10-16-family-send-checkboxes',
  '2026-10-16',
  'Tick families off before you send',
  'Slack & email',
  'Email families and Slack families (Directory, and the same windows on Finances and the waitlist) now let you leave families out of a send without changing the list filters. Each family in “see who gets it” has a checkbox, all on to start. Unticking a family leaves them out; the count and the Send button update as you tick. Select all / none ticks every family or none.',
  '/portal/directory',
  $json$[
    {"title":"Open Email families or Slack families","body":"From the **Directory** (or the same windows on Finances and the waitlist), open **Email families** or **Slack families**.","href":"/portal/directory"},
    {"title":"See who gets it","body":"Each family in **see who gets it** has a checkbox, all on to start. The **N families** count and **Send to N families** button follow the ticks."},
    {"title":"Leave a family out","body":"Untick a family to leave them out of this send. **Select all / none** ticks every family or none. Changing **Dads / Moms / Players**, or the Directory filters, starts the ticks over."}
  ]$json$::jsonb
where not exists (
  select 1 from public.olb_release_notes where seed_key = '2026-10-16-family-send-checkboxes'
);

notify pgrst, 'reload schema';

commit;
