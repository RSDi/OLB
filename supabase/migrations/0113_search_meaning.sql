-- 0113_search_meaning.sql
--
-- Search by meaning for the portal's Search page (/portal/search): "jersey"
-- finds the playbook that only says "uniform". Each searchable record is cut
-- into chunks of a few paragraphs, and each chunk gets an embedding (a list
-- of 1024 numbers standing for what it means) from an embedding model. A
-- question is embedded the same way, and the chunks closest to it in
-- meaning are the matches. search_hybrid blends those with a keyword match
-- on the same chunks.
--
-- What's indexed: playbooks (in sections), events, tasks with their
-- comments, PM tasks and templates, assets, and Slack threads (a message
-- with its replies). Members and external contacts aren't: names match
-- better by spelling, and the existing search_global handles them.
--
-- search_chunks          one row per chunk: the text, its embedding, and a
--                        keyword index. entity_key is the record's id, or
--                        for a Slack thread "<channel>|<thread ts>";
--                        entity_id is the record whose visibility the chunk
--                        follows (for a thread, its first archived message).
-- search_index_queue     records waiting to be (re)indexed. Triggers below
--                        add a record whenever it changes; the server works
--                        through the queue (lib/portal-search/indexer.ts)
--                        after searches, nightly (/api/cron/search-index) and
--                        with `npm run search-index`.
-- search_hybrid()        the search itself.
--
-- WHO SEES WHAT: a chunk is visible exactly when its source record is. The
-- chunks policy checks that the caller can see the source row, under that
-- table's own row-level security (a Slack thread in a private channel, a
-- staff-only playbook), so there's no second copy of anyone's permissions
-- to keep in step. search_hybrid runs as the caller (security invoker), so
-- it only ever ranks chunks the caller can see. The queue is server-only.
--
-- No vector index yet: the search compares the question with every chunk the
-- caller can see, which is exact and quick at this club's size. If it ever
-- slows down, add an HNSW index on embedding (with iterative scans, so the
-- permission filter can't starve the results).
--
-- Fills the queue with every existing record at the end, so the first
-- `npm run search-index` builds the whole index.
--
-- Apply via the Supabase SQL editor, after 0112. Idempotent.

begin;

create extension if not exists vector with schema extensions;

create table if not exists public.search_chunks (
  id            bigint generated always as identity primary key,
  entity_type   text not null check (entity_type in
                  ('playbook', 'event', 'maintenance', 'pm_task', 'pm_template', 'asset', 'slack')),
  entity_key    text not null,
  entity_id     uuid not null,
  chunk_index   integer not null,
  title         text not null,
  href          text not null,
  content       text not null,
  content_hash  text not null,
  embedding     extensions.vector(1024),
  fts           tsvector generated always as (to_tsvector('english', title || ' ' || content)) stored,
  updated_at    timestamptz not null default now(),
  unique (entity_type, entity_key, chunk_index)
);

create index if not exists search_chunks_fts_idx    on public.search_chunks using gin (fts);
create index if not exists search_chunks_entity_idx on public.search_chunks (entity_type, entity_id);

alter table public.search_chunks enable row level security;

-- Signed-in members read through the policy below; nobody else at all.
-- Writes come only from the server's service role.
revoke all on public.search_chunks from public, anon, authenticated;
grant select on public.search_chunks to authenticated;
grant all on public.search_chunks to service_role;

drop policy if exists "search_chunks_select_visible" on public.search_chunks;
create policy "search_chunks_select_visible" on public.search_chunks
  for select to authenticated
  using (
    case entity_type
      when 'playbook'    then exists (select 1 from public.playbooks s            where s.id = entity_id and s.deleted_at is null)
      when 'event'       then exists (select 1 from public.events s               where s.id = entity_id and s.deleted_at is null)
      when 'maintenance' then exists (select 1 from public.maintenance_requests s where s.id = entity_id and s.deleted_at is null)
      when 'pm_task'     then exists (select 1 from public.pm_instances s         where s.id = entity_id and s.deleted_at is null)
      when 'pm_template' then exists (select 1 from public.pm_templates s         where s.id = entity_id and s.deleted_at is null)
      when 'asset'       then exists (select 1 from public.assets s               where s.id = entity_id and s.deleted_at is null)
      when 'slack'       then exists (select 1 from public.slack_archive_messages s where s.id = entity_id)
      else false
    end
  );

create table if not exists public.search_index_queue (
  kind       text not null,
  key        text not null,
  queued_at  timestamptz not null default now(),
  primary key (kind, key)
);

create index if not exists search_index_queue_queued_idx on public.search_index_queue (queued_at);

-- Server-only: RLS on with no policies, so only the service role reads or
-- writes it.
alter table public.search_index_queue enable row level security;
revoke all on public.search_index_queue from public, anon, authenticated;
grant all on public.search_index_queue to service_role;

-- Adds the changed record to the queue. Security definer, since the member
-- editing a playbook can't write the queue themselves. tg_argv[0] is the
-- kind; a ticket comment queues its task, a Slack message its thread.
create or replace function public.search_index_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  k text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_argv[0] = 'slack' then
    k := r.channel_id || '|' || coalesce(r.thread_ts, r.ts);
  elsif tg_table_name = 'ticket_comments' then
    k := r.ticket_id::text;
  else
    k := r.id::text;
  end if;
  insert into public.search_index_queue (kind, key) values (tg_argv[0], k)
  on conflict (kind, key) do update set queued_at = now();
  return null;
end
$$;

revoke all on function public.search_index_enqueue() from public, anon, authenticated;

drop trigger if exists search_index_playbooks on public.playbooks;
create trigger search_index_playbooks after insert or update or delete on public.playbooks
  for each row execute function public.search_index_enqueue('playbook');

drop trigger if exists search_index_events on public.events;
create trigger search_index_events after insert or update or delete on public.events
  for each row execute function public.search_index_enqueue('event');

drop trigger if exists search_index_tasks on public.maintenance_requests;
create trigger search_index_tasks after insert or update or delete on public.maintenance_requests
  for each row execute function public.search_index_enqueue('maintenance');

drop trigger if exists search_index_task_comments on public.ticket_comments;
create trigger search_index_task_comments after insert or update or delete on public.ticket_comments
  for each row execute function public.search_index_enqueue('maintenance');

drop trigger if exists search_index_pm_tasks on public.pm_instances;
create trigger search_index_pm_tasks after insert or update or delete on public.pm_instances
  for each row execute function public.search_index_enqueue('pm_task');

drop trigger if exists search_index_pm_templates on public.pm_templates;
create trigger search_index_pm_templates after insert or update or delete on public.pm_templates
  for each row execute function public.search_index_enqueue('pm_template');

drop trigger if exists search_index_assets on public.assets;
create trigger search_index_assets after insert or update or delete on public.assets
  for each row execute function public.search_index_enqueue('asset');

drop trigger if exists search_index_slack on public.slack_archive_messages;
create trigger search_index_slack after insert or update or delete on public.slack_archive_messages
  for each row execute function public.search_index_enqueue('slack');

-- The search: the 60 chunks closest in meaning and the 60 best keyword
-- matches (any of the question's words), merged by reciprocal rank fusion
-- (each list contributes 1 / (60 + its rank)), best first. Runs as the
-- caller, so search_chunks' policy limits it to what they can see.
create or replace function public.search_hybrid(
  query_embedding extensions.vector(1024),
  query_text text,
  match_count integer default 20
)
returns table (
  entity_type  text,
  entity_key   text,
  entity_id    uuid,
  chunk_index  integer,
  title        text,
  href         text,
  content      text,
  score        real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with
  q as (
    -- plainto_tsquery drops stop words and stems; its "&" becomes "|" so a
    -- chunk matching any of the words counts, ranked by how well it matches.
    select nullif(replace(plainto_tsquery('english', coalesce(query_text, ''))::text, ' & ', ' | '), '')::tsquery as tsq
  ),
  semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as r
    from public.search_chunks c
    where c.embedding is not null
    order by c.embedding <=> query_embedding
    limit 60
  ),
  keyword as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc) as r
    from public.search_chunks c, q
    where q.tsq is not null and c.fts @@ q.tsq
    order by ts_rank_cd(c.fts, q.tsq) desc
    limit 60
  ),
  fused as (
    select x.id, sum(1.0 / (60 + x.r))::real as score
    from (select id, r from semantic union all select id, r from keyword) x
    group by x.id
  )
  select c.entity_type, c.entity_key, c.entity_id, c.chunk_index, c.title, c.href, c.content, f.score
  from fused f
  join public.search_chunks c on c.id = f.id
  order by f.score desc
  limit least(greatest(coalesce(match_count, 20), 1), 50)
$$;

revoke execute on function public.search_hybrid(extensions.vector, text, integer) from public, anon;
grant execute on function public.search_hybrid(extensions.vector, text, integer) to authenticated, service_role;

-- Queue everything that exists today.
insert into public.search_index_queue (kind, key)
select 'playbook', id::text from public.playbooks where deleted_at is null
union all select 'event', id::text from public.events where deleted_at is null
union all select 'maintenance', id::text from public.maintenance_requests where deleted_at is null
union all select 'pm_task', id::text from public.pm_instances where deleted_at is null
union all select 'pm_template', id::text from public.pm_templates where deleted_at is null
union all select 'asset', id::text from public.assets where deleted_at is null
union all select distinct 'slack', channel_id || '|' || coalesce(thread_ts, ts) from public.slack_archive_messages
on conflict (kind, key) do nothing;

commit;

notify pgrst, 'reload schema';
