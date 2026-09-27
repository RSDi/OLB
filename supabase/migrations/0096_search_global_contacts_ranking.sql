-- 0096_search_global_contacts_ranking.sql
--
-- Reworks the External Contacts group that 0094 added to search_global;
-- the rest of the function is unchanged (the baseline's, word for word).
-- This was written in parallel with 0094 as 0093_global_search_contacts.sql,
-- which collided with 0093_archive_global_search.sql, so it's renumbered
-- here. Production already runs it: it was applied by hand as 0093.
--
-- What changes in contact_hits:
--   - Ranking. Still trigram similarity, but of the best single field, the
--     way the maintenance hits do it, instead of one string of every field.
--     Contacts have many optional fields, and with one string a complete
--     record ranks below a sparse one ("Acme Uniforms" fell out of the top
--     five for "acme" in testing). The company isn't ranked on, so searching
--     a company's name lists it before the people who work there.
--   - The company (a person's parent contact) is matched too, as on the
--     External Contacts page's own search box.
--   - A deleted type or company neither matches nor shows. The deleted_at
--     filters on the joins matter because contacts_select_staff lets staff
--     read deleted rows.
--   - The nickname leads the subtitle, as for members: nickname · type ·
--     company · email · phone (or mobile).
--
-- Still security invoker, so RLS keeps contacts to staff. Five at most, like
-- every group.
--
-- Already applied to production (as 0093). Otherwise apply via the Supabase
-- SQL editor, after 0095. Idempotent.

create or replace function public.search_global(q text, max_total integer default 25)
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
  -- ▼ CHANGED in 0096 (added in 0094): External Contacts. Staff-only through RLS.
  contact_hits as (
    select
      'contact'::text as entity_type,
      c.id,
      c.name as title,
      nullif(trim(concat_ws(' · ',
        nullif(c.nickname,''),
        nullif(cat.name,''),
        nullif(parent.name,''),
        nullif(c.email,''),
        coalesce(nullif(c.phone,''), nullif(c.mobile_phone,''))
      )), '') as subtitle,
      '/portal/contacts/' || c.id::text as href,
      -- Best single field (greatest() skips nulls). parent.name only widens
      -- the match, so a company outranks the people who work there.
      greatest(
        similarity(c.name, q_norm.q),
        similarity(c.nickname, q_norm.q),
        similarity(cat.name, q_norm.q),
        similarity(c.email, q_norm.q),
        similarity(c.phone, q_norm.q),
        similarity(c.mobile_phone, q_norm.q),
        similarity(c.address, q_norm.q),
        similarity(c.account_number, q_norm.q),
        similarity(array_to_string(c.tags, ' '), q_norm.q)
      ) as rank
    from public.contacts c
    left join public.contact_categories cat
      on cat.id = c.category_id and cat.deleted_at is null
    left join public.contacts parent
      on parent.id = c.parent_contact_id and parent.deleted_at is null
    cross join q_norm
    where c.deleted_at is null
      and (
        c.name           ilike '%' || q_norm.q || '%' or
        c.nickname       ilike '%' || q_norm.q || '%' or
        c.email          ilike '%' || q_norm.q || '%' or
        c.phone          ilike '%' || q_norm.q || '%' or
        c.mobile_phone   ilike '%' || q_norm.q || '%' or
        c.address        ilike '%' || q_norm.q || '%' or
        c.account_number ilike '%' || q_norm.q || '%' or
        cat.name         ilike '%' || q_norm.q || '%' or
        parent.name      ilike '%' || q_norm.q || '%' or
        array_to_string(c.tags, ' ') ilike '%' || q_norm.q || '%'
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
    union all select * from contact_hits
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

notify pgrst, 'reload schema';
