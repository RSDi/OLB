-- 0112_search_log.sql
--
-- A log of the questions asked on the portal's Search page (/portal/search),
-- so the board can see what people look for, which questions the assistant
-- couldn't answer, and what it costs. One row per question (a follow-up is
-- its own row, with follow_up set).
--
--   question       what was asked, as typed
--   steps          the lookups the assistant made: [{ tool, input }]
--   cited          the records the answer cited: [{ type, id, title }]
--   sources        how many records the lookups returned in all
--   clarified      the assistant answered with a clarifying question
--   answered       an AI answer was written (false: rate limit, or the model
--                  failed and only the matching records were shown)
--   input_tokens / output_tokens / model   for working out the cost
--   error          why the answer failed, when it did
--   rating         for thumbs up / down on answers, not collected yet
--
-- Readable by super-admins only: it records who asked what. Nobody writes it
-- through the API; the server writes it with the service role
-- (lib/portal-search/log.ts). A deleted member's rows keep the question and
-- lose the link to them.
--
-- Apply via the Supabase SQL editor. Needs only the baseline. Idempotent.

begin;

create table if not exists public.search_log (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  member_id      uuid references public.members(id) on delete set null,
  question       text not null check (length(question) <= 500),
  follow_up      boolean not null default false,
  steps          jsonb not null default '[]'::jsonb,
  cited          jsonb not null default '[]'::jsonb,
  sources        integer not null default 0,
  clarified      boolean not null default false,
  answered       boolean not null default false,
  duration_ms    integer,
  input_tokens   integer,
  output_tokens  integer,
  model          text,
  error          text,
  rating         smallint check (rating is null or rating in (-1, 1))
);

create index if not exists search_log_created_idx on public.search_log (created_at desc);
create index if not exists search_log_member_idx  on public.search_log (member_id, created_at desc);

alter table public.search_log enable row level security;

drop policy if exists "search_log_select_super" on public.search_log;
create policy "search_log_select_super" on public.search_log
  for select to authenticated
  using ((select public.is_super_admin()));

commit;

notify pgrst, 'reload schema';
