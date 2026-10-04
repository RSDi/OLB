-- 0116_player_messages.sql
--
-- Emails to families from the Directory. The board and anyone with the
-- Registrations permission (0102) can write to the families of the players
-- in view (a team, an age group, who's missing a requirement) or to one
-- player's family from their page, the same way the waitlist does (0115).
--
--   olb_player_messages  each email sent, one row per player it was about,
--                        so the player's page can list what went to them.
--
-- Access: the board and the Registrations permission read and add messages.
-- Helper calls are wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0115. Idempotent.

begin;

create table if not exists public.olb_player_messages (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.olb_players(id) on delete cascade,
  subject    text not null check (length(btrim(subject)) between 1 and 200),
  body       text not null check (length(btrim(body)) between 1 and 5000),
  sent_to    text[] not null default '{}',
  sent_by    uuid references auth.users(id) on delete set null,
  sent_at    timestamptz not null default now()
);

create index if not exists olb_player_messages_player_idx
  on public.olb_player_messages (player_id, sent_at desc);

alter table public.olb_player_messages enable row level security;

drop policy if exists "olb_player_messages_select" on public.olb_player_messages;
create policy "olb_player_messages_select" on public.olb_player_messages
  for select to authenticated
  using ((select public.is_staff()) or (select public.can_manage_registrations()));

drop policy if exists "olb_player_messages_insert" on public.olb_player_messages;
create policy "olb_player_messages_insert" on public.olb_player_messages
  for insert to authenticated
  with check (
    ((select public.is_staff()) or (select public.can_manage_registrations()))
    and sent_by = (select auth.uid())
  );

notify pgrst, 'reload schema';

commit;
