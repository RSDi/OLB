-- 0107_contact_program_fields.sql
--
-- External Contacts learn what the HS planning spreadsheet's contact list
-- (the Contacts tab of "Omaha Lightning Schedule 2026-2027 Working copy for
-- Coaches and Board") knows about the programs we play, the gyms we rent and
-- the referees we call. All optional:
--
--   title        a person's role there: "Athletic Director", "Scheduler",
--                "Head Coach".
--   city, state  where a company is: "Ames", "IA". Shown beside its name and
--                searched; address stays the street address.
--   alt_email    a second email: a program's general inbox, a coach's school
--                address.
--   team_colors  a program's colors, "Navy & Gold", for picking jerseys.
--   aliases      other names people use for it: "RR", "DMW", "So Metro". The
--                HS Schedule (0108) matches the team names in its import
--                against these, and search finds a contact by them.
--
-- search_global's contact group matches the new fields too. This is 0106's
-- function word for word with only contact_hits changed: it also matches the
-- title, the other email, the aliases, the city and the state (the state
-- only as a whole word, "NE", so two letters don't match every name), and
-- the subtitle adds the title and "City, ST".
--
-- Apply via the Supabase SQL editor, after 0106. Idempotent.

alter table public.contacts
  add column if not exists title       text,
  add column if not exists city        text,
  add column if not exists state       text,
  add column if not exists alt_email   text,
  add column if not exists team_colors text,
  add column if not exists aliases     text[] not null default '{}';

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
  -- ▼ ADDED in 0093: External Contacts. Staff-only through RLS.
  -- ▼ CHANGED in 0107: also a person's title, a company's city and state,
  -- the other email and the aliases ("RR", "DMW"); the subtitle adds the
  -- title and the place.
  contact_hits as (
    select
      'contact'::text as entity_type,
      c.id,
      c.name as title,
      nullif(trim(concat_ws(' · ',
        nullif(c.nickname,''),
        nullif(c.title,''),
        nullif(cat.name,''),
        nullif(parent.name,''),
        nullif(concat_ws(', ', nullif(c.city,''), nullif(c.state,'')), ''),
        nullif(c.email,''),
        coalesce(nullif(c.phone,''), nullif(c.mobile_phone,''))
      )), '') as subtitle,
      '/portal/contacts/' || c.id::text as href,
      -- Best single field (greatest() skips nulls). parent.name only widens
      -- the match, so a company outranks the people who work there.
      greatest(
        similarity(c.name, q_norm.q),
        similarity(c.nickname, q_norm.q),
        similarity(array_to_string(c.aliases, ' '), q_norm.q),
        similarity(c.title, q_norm.q),
        similarity(cat.name, q_norm.q),
        similarity(c.email, q_norm.q),
        similarity(c.alt_email, q_norm.q),
        similarity(c.phone, q_norm.q),
        similarity(c.mobile_phone, q_norm.q),
        similarity(c.city, q_norm.q),
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
        array_to_string(c.aliases, ' ') ilike '%' || q_norm.q || '%' or
        c.title          ilike '%' || q_norm.q || '%' or
        c.email          ilike '%' || q_norm.q || '%' or
        c.alt_email      ilike '%' || q_norm.q || '%' or
        c.phone          ilike '%' || q_norm.q || '%' or
        c.mobile_phone   ilike '%' || q_norm.q || '%' or
        c.city           ilike '%' || q_norm.q || '%' or
        c.state          ilike q_norm.q or
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
