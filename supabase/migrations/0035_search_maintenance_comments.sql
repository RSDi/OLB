-- 0035_search_maintenance_comments.sql
--
-- Extend the maintenance hit in search_global() to also match the bodies
-- of ticket_comments. Now "ryan" surfaces a maintenance ticket whose
-- comment says "We need Ryan's lift", even though the description /
-- area / assignee mention no Ryan.
--
-- RLS on ticket_comments still applies (the function is SECURITY INVOKER),
-- so non-staff members only see comments on their own tickets.
--
-- Adds a trigram GIN index on ticket_comments.body so the EXISTS subquery
-- stays cheap.

begin;

create index if not exists ticket_comments_body_search_idx
  on public.ticket_comments using gin (body gin_trgm_ops)
  where deleted_at is null;

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
  -- ▼ CHANGED in 0035: also match (and rank against) ticket_comments.body.
  maintenance_hits as (
    select
      'maintenance'::text as entity_type,
      mr.id,
      mr.description as title,
      nullif(trim(concat_ws(' · ',
        nullif('Area: ' || a.name, 'Area: '),
        nullif('Owner: ' || asn.full_name, 'Owner: ')
      )), '') as subtitle,
      '/portal/maintenance/' || mr.id::text as href,
      greatest(
        similarity(mr.description, q_norm.q),
        coalesce(similarity(a.name, q_norm.q), 0),
        coalesce(similarity(asn.full_name, q_norm.q), 0),
        coalesce((
          select max(similarity(tc.body, q_norm.q))
          from public.ticket_comments tc
          where tc.ticket_id = mr.id
            and tc.deleted_at is null
            and tc.body ilike '%' || q_norm.q || '%'
        ), 0)
      ) as rank
    from public.maintenance_requests mr
    left join public.areas   a   on a.id   = mr.area_id
    left join public.members asn on asn.id = mr.assigned_to
    cross join q_norm
    where mr.deleted_at is null
      and (
        mr.description ilike '%' || q_norm.q || '%' or
        a.name         ilike '%' || q_norm.q || '%' or
        asn.full_name  ilike '%' || q_norm.q || '%' or
        exists (
          select 1 from public.ticket_comments tc
          where tc.ticket_id = mr.id
            and tc.deleted_at is null
            and tc.body ilike '%' || q_norm.q || '%'
        )
      )
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

commit;
