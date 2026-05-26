-- 0033_global_search.sql
--
-- Postgres trigram-based global search for the portal command palette.
--
-- One RPC (`search_global`) UNIONs across members, maintenance, PM tasks,
-- PM templates, assets, events, and playbooks, returning a ranked hit list
-- the UI can render directly. Each searchable table gets a GIN trigram
-- index so `ILIKE '%q%'` stays cheap even at full table scans.
--
-- Playbooks get a derived `body_search` column (title + excerpt + markdown
-- stripped down to plain text) so searching for "VBS prep" hits the body
-- without competing with markdown syntax.
--
-- RLS applies automatically: the function runs with `security invoker` so
-- each caller only sees rows their existing policies already grant. That
-- means a regular member's search of maintenance only returns their own
-- tickets, super-admins see everything, etc.
--
-- Idempotent — safe to re-run.

begin;

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Trigram indexes per searchable table.
--
-- The index expression must match the predicate used in the search query,
-- so each index covers the exact concatenation the RPC searches against.
-- ---------------------------------------------------------------------------

create index if not exists members_search_idx
  on public.members using gin (
    (
      coalesce(full_name,'')  || ' ' ||
      coalesce(nickname,'')   || ' ' ||
      coalesce(email,'')      || ' ' ||
      coalesce(phone,'')      || ' ' ||
      coalesce(home_phone,'') || ' ' ||
      coalesce(address,'')
    ) gin_trgm_ops
  )
  where deleted_at is null;

create index if not exists maintenance_requests_search_idx
  on public.maintenance_requests using gin (description gin_trgm_ops)
  where deleted_at is null;

create index if not exists pm_instances_search_idx
  on public.pm_instances using gin (
    (coalesce(title,'') || ' ' || coalesce(description,'')) gin_trgm_ops
  )
  where deleted_at is null;

create index if not exists pm_templates_search_idx
  on public.pm_templates using gin (
    (coalesce(title,'') || ' ' || coalesce(description,'')) gin_trgm_ops
  )
  where deleted_at is null;

create index if not exists assets_search_idx
  on public.assets using gin (
    (coalesce(name,'') || ' ' || coalesce(type,'')) gin_trgm_ops
  )
  where deleted_at is null;

create index if not exists events_search_idx
  on public.events using gin (
    (
      coalesce(title,'')       || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(location,'')
    ) gin_trgm_ops
  )
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. Playbooks: derive a `body_search` column with markdown noise stripped.
--
-- We don't want a search for "VBS" to compete with `[VBS](https://...)` or
-- `## VBS prep`. Strip the most common markdown syntax server-side so the
-- index sees plain text.
-- ---------------------------------------------------------------------------

alter table public.playbooks
  add column if not exists body_search text;

create or replace function public.strip_markdown(md text)
returns text
language sql
immutable
as $$
  select case when md is null or md = '' then '' else
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(md,
              '!?\[([^\]]*)\]\(([^)]+)\)', '\1', 'g'  -- [text](url) and ![alt](src)
            ),
            '`+([^`]+)`+', '\1', 'g'                    -- inline + fenced code markers
          ),
          '[*_~#>]+', ' ', 'g'                          -- emphasis, headings, blockquote, strike
        ),
        E'\n+', ' ', 'g'                                -- newlines collapse
      ),
      '\s+', ' ', 'g'                                   -- whitespace collapse
    )
  end
$$;

create or replace function public.playbooks_refresh_body_search()
returns trigger
language plpgsql
as $$
begin
  new.body_search :=
    coalesce(new.title,'')   || ' ' ||
    coalesce(new.excerpt,'') || ' ' ||
    public.strip_markdown(new.body_md);
  return new;
end;
$$;

drop trigger if exists playbooks_body_search on public.playbooks;
create trigger playbooks_body_search
  before insert or update of title, excerpt, body_md on public.playbooks
  for each row execute function public.playbooks_refresh_body_search();

-- Backfill so existing rows are searchable immediately.
update public.playbooks
set body_search =
    coalesce(title,'')   || ' ' ||
    coalesce(excerpt,'') || ' ' ||
    public.strip_markdown(body_md)
where body_search is null or body_search = '';

create index if not exists playbooks_search_idx
  on public.playbooks using gin (body_search gin_trgm_ops)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3. The RPC.
--
-- Returns up to `max_total` rows, capped at 5 per entity_type. Ordered by
-- trigram similarity (so the best fuzzy match floats up regardless of which
-- table it came from).
--
-- entity_type values: member, maintenance, pm_task, pm_template, asset,
-- event, playbook — these map 1:1 to the icon + href the UI renders.
--
-- Short queries (< 2 chars) return nothing so we don't scan everything for
-- a single keystroke.
-- ---------------------------------------------------------------------------

create or replace function public.search_global(
  q text,
  max_total int default 25
)
returns table (
  entity_type text,
  id          uuid,
  title       text,
  subtitle    text,
  href        text,
  rank        real
)
language sql
stable
security invoker
as $$
  with
  q_norm as (
    -- Empty CTE for too-short queries means every downstream cross-join
    -- produces zero rows — no scan.
    select trim(q) as q
    where char_length(trim(q)) >= 2
  ),
  members_hits as (
    select
      'member'::text as entity_type,
      m.id,
      coalesce(m.full_name, m.email, 'Member') as title,
      nullif(trim(concat_ws(' · ',
        nullif(m.nickname,''),
        nullif(m.email,''),
        nullif(m.phone, '')
      )), '') as subtitle,
      '/portal/directory/' || m.id::text as href,
      similarity(
        coalesce(m.full_name,'')  || ' ' || coalesce(m.nickname,'')   || ' ' ||
        coalesce(m.email,'')      || ' ' || coalesce(m.phone,'')      || ' ' ||
        coalesce(m.home_phone,'') || ' ' || coalesce(m.address,''),
        q_norm.q
      ) as rank
    from public.members m, q_norm
    where m.deleted_at is null
      and m.status = 'approved'
      and (
        m.full_name  ilike '%' || q_norm.q || '%' or
        m.nickname   ilike '%' || q_norm.q || '%' or
        m.email      ilike '%' || q_norm.q || '%' or
        m.phone      ilike '%' || q_norm.q || '%' or
        m.home_phone ilike '%' || q_norm.q || '%' or
        m.address    ilike '%' || q_norm.q || '%'
      )
  ),
  maintenance_hits as (
    select
      'maintenance'::text as entity_type,
      mr.id,
      mr.description as title,
      coalesce(nullif('Area: ' || a.name, 'Area: '), mr.status) as subtitle,
      '/portal/maintenance/' || mr.id::text as href,
      similarity(mr.description, q_norm.q) as rank
    from public.maintenance_requests mr
    left join public.areas a on a.id = mr.area_id
    cross join q_norm
    where mr.deleted_at is null
      and mr.description ilike '%' || q_norm.q || '%'
  ),
  pm_instance_hits as (
    select
      'pm_task'::text as entity_type,
      i.id,
      i.title,
      coalesce(
        'Scheduled ' || to_char(i.scheduled_for, 'Mon DD'),
        i.status
      ) as subtitle,
      '/portal/pm/' || i.id::text as href,
      similarity(
        coalesce(i.title,'') || ' ' || coalesce(i.description,''),
        q_norm.q
      ) as rank
    from public.pm_instances i, q_norm
    where i.deleted_at is null
      and (
        i.title ilike '%' || q_norm.q || '%' or
        i.description ilike '%' || q_norm.q || '%'
      )
  ),
  pm_template_hits as (
    select
      'pm_template'::text as entity_type,
      t.id,
      t.title,
      'PM template' as subtitle,
      '/portal/pm/templates/' || t.id::text || '/edit' as href,
      similarity(
        coalesce(t.title,'') || ' ' || coalesce(t.description,''),
        q_norm.q
      ) as rank
    from public.pm_templates t, q_norm
    where t.deleted_at is null
      and (
        t.title ilike '%' || q_norm.q || '%' or
        t.description ilike '%' || q_norm.q || '%'
      )
  ),
  asset_hits as (
    select
      'asset'::text as entity_type,
      a.id,
      a.name as title,
      nullif(a.type,'') as subtitle,
      '/portal/pm/assets/' || a.id::text as href,
      similarity(
        coalesce(a.name,'') || ' ' || coalesce(a.type,''),
        q_norm.q
      ) as rank
    from public.assets a, q_norm
    where a.deleted_at is null
      and (
        a.name ilike '%' || q_norm.q || '%' or
        a.type ilike '%' || q_norm.q || '%'
      )
  ),
  event_hits as (
    select
      'event'::text as entity_type,
      e.id,
      e.title,
      to_char(e.start_at, 'Mon DD YYYY') as subtitle,
      '/portal/events/' || e.id::text || '/edit' as href,
      similarity(
        coalesce(e.title,'') || ' ' || coalesce(e.description,'') || ' ' || coalesce(e.location,''),
        q_norm.q
      ) as rank
    from public.events e, q_norm
    where e.deleted_at is null
      and (
        e.title       ilike '%' || q_norm.q || '%' or
        e.description ilike '%' || q_norm.q || '%' or
        e.location    ilike '%' || q_norm.q || '%'
      )
  ),
  playbook_hits as (
    select
      'playbook'::text as entity_type,
      p.id,
      p.title,
      nullif(p.excerpt,'') as subtitle,
      '/portal/docs/' || p.id::text as href,
      similarity(p.body_search, q_norm.q) as rank
    from public.playbooks p, q_norm
    where p.deleted_at is null
      and p.body_search ilike '%' || q_norm.q || '%'
  ),
  all_hits as (
              select * from members_hits
    union all select * from maintenance_hits
    union all select * from pm_instance_hits
    union all select * from pm_template_hits
    union all select * from asset_hits
    union all select * from event_hits
    union all select * from playbook_hits
  ),
  ranked as (
    select
      entity_type, id, title, subtitle, href, rank,
      row_number() over (
        partition by entity_type
        order by rank desc, title
      ) as cat_rn
    from all_hits
  )
  select entity_type, id, title, subtitle, href, rank
  from ranked
  where cat_rn <= 5
  order by rank desc, entity_type, title
  limit max_total;
$$;

grant execute on function public.search_global(text, int) to authenticated;

commit;
