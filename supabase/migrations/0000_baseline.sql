


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."archive_author_counts"() RETURNS TABLE("author_name" "text", "message_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select author_name, count(*) as message_count
  from public.slack_archive_messages
  where author_name is not null
  group by author_name
  order by author_name
$$;


ALTER FUNCTION "public"."archive_author_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_author_counts_filtered"("p_query" "text" DEFAULT NULL::"text", "p_channel_ids" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("author_name" "text", "message_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select author_name, count(*) as message_count
  from public.slack_archive_messages
  where author_name is not null
    and (p_channel_ids is null or channel_id = any(p_channel_ids))
    and (p_query is null or p_query = '' or message_text_search @@ websearch_to_tsquery('english', p_query))
  group by author_name
  order by author_name
$$;


ALTER FUNCTION "public"."archive_author_counts_filtered"("p_query" "text", "p_channel_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_author_counts_for_query"("p_query" "text") RETURNS TABLE("author_name" "text", "message_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select author_name, count(*) as message_count
  from public.slack_archive_messages
  where author_name is not null
    and message_text_search @@ websearch_to_tsquery('english', p_query)
  group by author_name
  order by author_name
$$;


ALTER FUNCTION "public"."archive_author_counts_for_query"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_channel_counts_filtered"("p_query" "text" DEFAULT NULL::"text", "p_authors" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("channel_id" "text", "message_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select channel_id, count(*) as message_count
  from public.slack_archive_messages
  where (p_authors is null or author_name = any(p_authors))
    and (p_query is null or p_query = '' or message_text_search @@ websearch_to_tsquery('english', p_query))
  group by channel_id
$$;


ALTER FUNCTION "public"."archive_channel_counts_filtered"("p_query" "text", "p_authors" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_visible_channel_ids"() RETURNS SETOF "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select c.slack_channel_id
  from public.slack_archive_channels c
  cross join lateral (
    select m.id, m.role, m.status, m.access_revoked_at
    from public.members m
    where m.user_id = auth.uid()
      and m.deleted_at is null
    limit 1
  ) me
  where me.role = 'super_admin'
     or (
       me.status = 'approved'
       and me.access_revoked_at is null
       and (
         c.is_private is false
         or exists (
           select 1
           from public.slack_archive_channel_members cm
           where cm.channel_id = c.slack_channel_id
             and cm.member_id = me.id
         )
       )
     )
$$;


ALTER FUNCTION "public"."archive_visible_channel_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_delete_settings"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select m.role = 'super_admin'
        or (m.status = 'approved' and m.role = 'admin' and m.can_delete_settings)
      from public.members m where m.user_id = auth.uid()
  ), false)
$$;


ALTER FUNCTION "public"."can_delete_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_settings"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select m.role = 'super_admin'
        or (m.status = 'approved' and m.role = 'admin' and m.can_edit_settings)
      from public.members m where m.user_id = auth.uid()
  ), false)
$$;


ALTER FUNCTION "public"."can_edit_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_settings"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select m.role = 'super_admin'
        or (m.status = 'approved' and m.role = 'admin'
            and (m.can_edit_settings or m.can_delete_settings or m.can_undelete_settings))
      from public.members m where m.user_id = auth.uid()
  ), false)
$$;


ALTER FUNCTION "public"."can_manage_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_undelete_settings"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((
    select m.role = 'super_admin'
        or (m.status = 'approved' and m.role = 'admin' and m.can_undelete_settings)
      from public.members m where m.user_id = auth.uid()
  ), false)
$$;


ALTER FUNCTION "public"."can_undelete_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cast_request_vote"("p_ticket_id" "uuid", "p_vote" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_note   text := nullif(trim(coalesce(p_note, '')), '');
  v_status text;
  v_yes    int;
  v_no     int;
begin
  if not public.is_staff() then
    raise exception 'Only building committee members can vote';
  end if;
  if p_vote not in ('yes', 'no') then
    raise exception 'Vote must be yes or no';
  end if;
  if p_vote = 'no' and v_note is null then
    raise exception 'A reason is required when voting no';
  end if;

  select review_status into v_status
    from public.maintenance_requests
   where id = p_ticket_id and deleted_at is null;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_status <> 'pending_review' then
    raise exception 'This request has already been decided';
  end if;

  insert into public.request_votes (ticket_id, voter_id, vote, note)
  values (p_ticket_id, auth.uid(), p_vote, v_note)
  on conflict (ticket_id, voter_id)
  do update set vote = excluded.vote, note = excluded.note, updated_at = now();

  -- Tally from people who are still on the committee (advisory display only).
  select count(*) filter (where v.vote = 'yes'),
         count(*) filter (where v.vote = 'no')
    into v_yes, v_no
    from public.request_votes v
    join public.members m on m.user_id = v.voter_id
   where v.ticket_id = p_ticket_id
     and m.role in ('admin', 'super_admin')
     and m.status = 'approved'
     and m.deleted_at is null;

  return jsonb_build_object('yes', v_yes, 'no', v_no);
end
$$;


ALTER FUNCTION "public"."cast_request_vote"("p_ticket_id" "uuid", "p_vote" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."closures_set_audit_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
  elsif TG_OP = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."closures_set_audit_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_request"("p_ticket_id" "uuid", "p_decision" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_note   text := nullif(trim(coalesce(p_note, '')), '');
  v_status text;
begin
  if not public.is_staff() then
    raise exception 'Only building committee members can decide a request';
  end if;
  if p_decision not in ('approved', 'declined') then
    raise exception 'Decision must be approved or declined';
  end if;
  if p_decision = 'declined' and v_note is null then
    raise exception 'A note is required when declining';
  end if;

  -- Lock the row so two simultaneous decisions can't both land.
  select review_status into v_status
    from public.maintenance_requests
   where id = p_ticket_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_status <> 'pending_review' then
    raise exception 'This request has already been decided';
  end if;

  update public.maintenance_requests
     set review_status  = p_decision,
         decision_note  = v_note,
         -- Keep the legacy decline_reason populated on declines so older
         -- displays/emails that read it still work.
         decline_reason = case when p_decision = 'declined' then v_note else decline_reason end,
         reviewed_by    = auth.uid(),
         reviewed_at    = now()
   where id = p_ticket_id;

  return jsonb_build_object('decided', p_decision);
end
$$;


ALTER FUNCTION "public"."decide_request"("p_ticket_id" "uuid", "p_decision" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_supply"("p_supply_id" "uuid", "p_qty" numeric) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  new_qty numeric;
begin
  if not public.is_staff() then
    raise exception 'Only staff can decrement supplies';
  end if;
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;
  update public.supplies
  set on_hand = greatest(0, on_hand - p_qty)
  where id = p_supply_id and deleted_at is null
  returning on_hand into new_qty;
  if new_qty is null then
    raise exception 'Supply % not found or deleted', p_supply_id;
  end if;
  return new_qty;
end
$$;


ALTER FUNCTION "public"."decrement_supply"("p_supply_id" "uuid", "p_qty" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_member_privilege_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Trusted backend (service key) and super-admins may change anything.
  if coalesce(current_setting('role', true), '') = 'service_role' then
    return new;
  end if;
  if public.is_super_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       or new.can_edit_settings is distinct from old.can_edit_settings
       or new.can_delete_settings is distinct from old.can_delete_settings
       or new.can_undelete_settings is distinct from old.can_undelete_settings then
      raise exception 'Only a super-admin can change a member''s role or settings grants';
    end if;
  elsif tg_op = 'INSERT' then
    if new.role <> 'member'
       or new.can_edit_settings
       or new.can_delete_settings
       or new.can_undelete_settings then
      raise exception 'Only a super-admin can create a member with a role or settings grants';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_member_privilege_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.members WHERE user_id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approved"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select status = 'approved'
       from public.members
      where user_id = auth.uid()
        and deleted_at is null),
    false
  )
$$;


ALTER FUNCTION "public"."is_approved"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select role in ('admin','super_admin')
       from public.members
      where user_id = auth.uid()
        and deleted_at is null),
    false
  )
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select role = 'super_admin'
       from public.members
      where user_id = auth.uid()
        and deleted_at is null),
    false
  )
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_task_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.review_status is distinct from old.review_status then
    insert into public.task_review_log (ticket_id, changed_by, old_status, new_status, reason)
    values (new.id, auth.uid(), old.review_status, new.review_status,
            coalesce(new.decision_note, new.decline_reason));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."log_task_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."members_enforce_self_update_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_super_admin() then
    return new;
  end if;

  if new.id                  is distinct from old.id
     or new.user_id             is distinct from old.user_id
     or new.email               is distinct from old.email
     or new.role                is distinct from old.role
     or new.requested_at        is distinct from old.requested_at
     or new.directory_category  is distinct from old.directory_category
     or new.membership_status   is distinct from old.membership_status
     or new.joined_at           is distinct from old.joined_at
     or new.baptism_at          is distinct from old.baptism_at
     or new.deceased_at         is distinct from old.deceased_at
     or new.wiffleball_opt_out  is distinct from old.wiffleball_opt_out
     or new.access_revoked_at   is distinct from old.access_revoked_at
     or new.deleted_at          is distinct from old.deleted_at
  then
    raise exception 'Only super-admins can change role, email, deletion, or admin-managed directory fields';
  end if;

  if (new.status      is distinct from old.status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by)
     and not public.is_staff()
  then
    raise exception 'Only the building committee can change member status';
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."members_enforce_self_update_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."members_write_audit_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old jsonb;
  v_new jsonb;
  v_member_id uuid;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    v_member_id := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_member_id := NEW.id;
  elsif TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_member_id := OLD.id;
  end if;

  -- Skip no-op updates (every column identical). Postgres still fires the
  -- trigger when an UPDATE didn't actually change anything; without this
  -- guard we'd log noise from save-without-edit clicks.
  if TG_OP = 'UPDATE' and v_old is not distinct from v_new then
    return null;
  end if;

  insert into public.member_audit_log (member_id, changed_by, action, old_data, new_data)
  values (v_member_id, auth.uid(), lower(TG_OP), v_old, v_new);

  return null;
end
$$;


ALTER FUNCTION "public"."members_write_audit_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_task"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select submitted_by = auth.uid()
       from public.maintenance_requests
      where id = p_id
        and deleted_at is null),
    false
  )
$$;


ALTER FUNCTION "public"."owns_task"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."playbook_procedures_set_audit_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
  elsif TG_OP = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."playbook_procedures_set_audit_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."playbooks_refresh_body_search"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.body_search :=
    coalesce(new.title,'')   || ' ' ||
    coalesce(new.excerpt,'') || ' ' ||
    public.strip_markdown(new.body_md);
  return new;
end;
$$;


ALTER FUNCTION "public"."playbooks_refresh_body_search"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."playbooks_set_audit_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
  elsif TG_OP = 'UPDATE' then
    -- Preserve original creator; refresh updater + timestamp.
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."playbooks_set_audit_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."playbooks_write_version"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
  v_next_version int;
begin
  -- Skip no-op updates so save-without-edit clicks don't bloat history.
  if TG_OP = 'UPDATE' then
    v_old_snapshot := jsonb_build_object(
      'title',       OLD.title,
      'category_id', OLD.category_id,
      'excerpt',     OLD.excerpt,
      'body_md',     OLD.body_md
    );
    v_new_snapshot := jsonb_build_object(
      'title',       NEW.title,
      'category_id', NEW.category_id,
      'excerpt',     NEW.excerpt,
      'body_md',     NEW.body_md
    );
    if v_old_snapshot is not distinct from v_new_snapshot then
      return null;
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_next_version
    from public.playbook_versions
    where playbook_id = NEW.id;

  insert into public.playbook_versions
    (playbook_id, version_number, title, category_id, excerpt, body_md, changed_by)
  values
    (NEW.id, v_next_version, NEW.title, NEW.category_id, NEW.excerpt, NEW.body_md, NEW.updated_by);

  return null;
end
$$;


ALTER FUNCTION "public"."playbooks_write_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_global"("q" "text", "max_total" integer DEFAULT 25) RETURNS TABLE("entity_type" "text", "id" "uuid", "title" "text", "subtitle" "text", "href" "text", "rank" real)
    LANGUAGE "sql" STABLE
    AS $$
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


ALTER FUNCTION "public"."search_global"("q" "text", "max_total" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."strip_markdown"("md" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
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


ALTER FUNCTION "public"."strip_markdown"("md" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "responsible_team_id" "uuid"
);


ALTER TABLE "public"."areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_supplies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "qty_per_use" numeric(10,2) DEFAULT 1 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "asset_supplies_qty_positive" CHECK (("qty_per_use" > (0)::numeric))
);


ALTER TABLE "public"."asset_supplies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "area_id" "uuid",
    "type" "text",
    "notes" "text",
    "attributes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."building_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "space" "text" NOT NULL,
    "date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "attendance" integer,
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text"
);


ALTER TABLE "public"."building_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."closure_reasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body_md" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."closure_reasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."closures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reason_id" "uuid",
    "title" "text" NOT NULL,
    "body_md" "text" DEFAULT ''::"text" NOT NULL,
    "starts_on" "date" DEFAULT (("now"() AT TIME ZONE 'America/Chicago'::"text"))::"date" NOT NULL,
    "ends_on" "date",
    "cleared_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "closures_dates_ok" CHECK ((("ends_on" IS NULL) OR ("ends_on" >= "starts_on")))
);


ALTER TABLE "public"."closures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."contact_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "contact_links_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['maintenance_ticket'::"text", 'pm_asset'::"text", 'playbook'::"text"])))
);


ALTER TABLE "public"."contact_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "parent_contact_id" "uuid",
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "nickname" "text",
    "email" "text",
    "phone" "text",
    "mobile_phone" "text",
    "website" "text",
    "address" "text",
    "account_number" "text",
    "customer_id" "text",
    "payment_terms" "text",
    "tax_id" "text",
    "notes" "text",
    "reorder_notes" "text",
    "quote_contact_notes" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "contacts_kind_check" CHECK (("kind" = ANY (ARRAY['company'::"text", 'person'::"text"]))),
    CONSTRAINT "contacts_no_self_parent" CHECK ((("parent_contact_id" IS NULL) OR ("parent_contact_id" <> "id")))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "chip_class" "text" DEFAULT 'rsd-chip-mute'::"text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."event_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone,
    "location" "text",
    "area_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "category_id" "uuid",
    "source_ticket_id" "uuid",
    "shutdown_playbook_id" "uuid",
    "recurring" boolean DEFAULT false NOT NULL,
    "recur_weekdays" integer[],
    "recur_until" "date",
    "recur_freq" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "recur_monthly_week" integer,
    "recur_monthly_weekday" integer,
    "recur_except" "text"[],
    "shutdown_procedure_id" "uuid",
    CONSTRAINT "events_end_after_start" CHECK ((("end_at" IS NULL) OR ("end_at" >= "start_at"))),
    CONSTRAINT "events_recur_freq_check" CHECK (("recur_freq" = ANY (ARRAY['weekly'::"text", 'monthly'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "submitted_by" "uuid",
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text",
    "area_id" "uuid",
    "priority_id" "uuid",
    "assigned_to" "uuid",
    "deleted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category_id" "uuid",
    "project_id" "uuid",
    "review_status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "decline_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "details" "jsonb",
    "cost" numeric(10,2),
    "slack_channel_id" "text",
    "slack_message_ts" "text",
    "event_id" "uuid",
    "occurrence_date" "date",
    "parent_id" "uuid",
    "budget" numeric(10,2),
    "start_on" "date",
    "someday" boolean DEFAULT false NOT NULL,
    "due_on" "date",
    "decision_note" "text",
    CONSTRAINT "maintenance_requests_review_status_check" CHECK (("review_status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'declined'::"text"]))),
    CONSTRAINT "maintenance_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'done'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."maintenance_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid",
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action" "text" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb",
    CONSTRAINT "member_audit_log_action_check" CHECK (("action" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text"])))
);


ALTER TABLE "public"."member_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "related_member_id" "uuid" NOT NULL,
    "relationship" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "member_relationships_no_self" CHECK (("member_id" <> "related_member_id")),
    CONSTRAINT "member_relationships_relationship_check" CHECK (("relationship" = ANY (ARRAY['spouse'::"text", 'parent'::"text", 'child'::"text"])))
);


ALTER TABLE "public"."member_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_volunteer_teams" (
    "member_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "member_ministries_role_check" CHECK (("role" = ANY (ARRAY['lead'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."member_volunteer_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "user_id" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "phone" "text",
    "birthday" "date",
    "address" "text",
    "home_phone" "text",
    "nickname" "text",
    "anniversary" "date",
    "deceased_at" "date",
    "directory_category" "text" DEFAULT 'regular'::"text" NOT NULL,
    "membership_status" "text" DEFAULT 'regular'::"text" NOT NULL,
    "joined_at" "date",
    "baptism_at" "date",
    "wiffleball_opt_out" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "can_edit_settings" boolean DEFAULT false NOT NULL,
    "can_delete_settings" boolean DEFAULT false NOT NULL,
    "can_undelete_settings" boolean DEFAULT false NOT NULL,
    "things_enabled" boolean DEFAULT false NOT NULL,
    "access_revoked_at" timestamp with time zone,
    CONSTRAINT "members_directory_category_check" CHECK (("directory_category" = ANY (ARRAY['regular'::"text", 'extended'::"text", 'memorial'::"text"]))),
    CONSTRAINT "members_membership_status_check" CHECK (("membership_status" = ANY (ARRAY['visiting'::"text", 'regular'::"text", 'moved'::"text", 'inactive'::"text"]))),
    CONSTRAINT "members_memorial_deceased_check" CHECK (((("directory_category" = 'memorial'::"text") AND ("deceased_at" IS NOT NULL)) OR (("directory_category" <> 'memorial'::"text") AND ("deceased_at" IS NULL)))),
    CONSTRAINT "members_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'admin'::"text", 'super_admin'::"text"]))),
    CONSTRAINT "members_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text"])))
);


ALTER TABLE "public"."members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members_notes" (
    "member_id" "uuid" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."members_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."playbook_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "chip_class" "text" DEFAULT 'rsd-chip-mute'::"text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."playbook_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."playbook_procedures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "playbook_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Procedure'::"text" NOT NULL,
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notify" boolean DEFAULT false NOT NULL,
    "slack_channel" "text",
    "completion_message" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."playbook_procedures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."playbook_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "playbook_id" "uuid",
    "version_number" integer NOT NULL,
    "title" "text" NOT NULL,
    "category_id" "uuid",
    "excerpt" "text",
    "body_md" "text" DEFAULT ''::"text" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."playbook_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."playbooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "category_id" "uuid",
    "excerpt" "text",
    "body_md" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "body_search" "text",
    "steps" "jsonb",
    "wizard_slack_channel" "text",
    "wizard_completion_message" "text"
);


ALTER TABLE "public"."playbooks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pm_instance_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "step_checks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pm_instance_assets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'done'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."pm_instance_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pm_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "area_id" "uuid",
    "priority_id" "uuid",
    "scheduled_for" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "step_checks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "pm_instances_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'done'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."pm_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pm_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "area_id" "uuid",
    "priority_id" "uuid",
    "schedule_kind" "text" NOT NULL,
    "schedule_value" integer NOT NULL,
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "asset_type" "text",
    "per_asset" boolean DEFAULT false NOT NULL,
    CONSTRAINT "pm_templates_schedule_kind_check" CHECK (("schedule_kind" = ANY (ARRAY['monthly_day'::"text", 'weekly_day'::"text", 'after_completion_days'::"text"]))),
    CONSTRAINT "pm_templates_schedule_value_check" CHECK (((("schedule_kind" = 'monthly_day'::"text") AND (("schedule_value" >= 1) AND ("schedule_value" <= 28))) OR (("schedule_kind" = 'weekly_day'::"text") AND (("schedule_value" >= 0) AND ("schedule_value" <= 6))) OR (("schedule_kind" = 'after_completion_days'::"text") AND (("schedule_value" >= 1) AND ("schedule_value" <= 3650)))))
);


ALTER TABLE "public"."pm_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."priorities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "severity" integer DEFAULT 0 NOT NULL,
    "chip_class" "text" DEFAULT 'rsd-chip-mute'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."priorities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."procedure_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "procedure_id" "uuid" NOT NULL,
    "ran_by" "uuid",
    "ran_by_name" "text",
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notified" boolean DEFAULT false NOT NULL,
    "source" "text",
    "note" "text"
);


ALTER TABLE "public"."procedure_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "budget" numeric(10,2),
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'done'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reel_notes_action_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recording_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "routed_to" "text",
    "done" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_member_id" "uuid",
    "supporter_member_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "suggested_assignee_name" "text",
    "suggested_member_id" "uuid",
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "suggested_supporter_names" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "anchor_quote" "text",
    "transcript_ms" bigint,
    "task_id" "uuid",
    "dismissed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "daves_idea_action_items_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'emergency'::"text"])))
);


ALTER TABLE "public"."reel_notes_action_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reel_notes_recordings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "audio_blob_url" "text",
    "duration_sec" integer DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'pwa'::"text" NOT NULL,
    "status" "text" DEFAULT 'uploading'::"text" NOT NULL,
    "assemblyai_id" "text",
    "transcript" "text",
    "utterances" "jsonb",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "summary" "jsonb",
    "linked_entity_type" "text",
    "linked_entity_id" "uuid",
    CONSTRAINT "daves_idea_recordings_status_check" CHECK (("status" = ANY (ARRAY['uploading'::"text", 'transcribing'::"text", 'extracting'::"text", 'ready'::"text", 'failed'::"text"]))),
    CONSTRAINT "reel_notes_recordings_source_check" CHECK (("source" = ANY (ARRAY['pwa'::"text", 'native'::"text", 'watch'::"text", 'typed'::"text"])))
);


ALTER TABLE "public"."reel_notes_recordings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."request_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "voter_id" "uuid" NOT NULL,
    "vote" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "request_votes_vote_check" CHECK (("vote" = ANY (ARRAY['yes'::"text", 'no'::"text"])))
);


ALTER TABLE "public"."request_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slack_archive_channel_members" (
    "channel_id" "text" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."slack_archive_channel_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slack_archive_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slack_channel_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "added_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_private" boolean,
    "access_checked_at" timestamp with time zone,
    "access_error" "text"
);


ALTER TABLE "public"."slack_archive_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slack_archive_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "text" NOT NULL,
    "ts" "text" NOT NULL,
    "thread_ts" "text",
    "author_slack_id" "text",
    "author_member_id" "uuid",
    "author_name" "text",
    "message_text" "text" DEFAULT ''::"text" NOT NULL,
    "reactions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "files" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "raw" "jsonb" NOT NULL,
    "edited" boolean DEFAULT false NOT NULL,
    "posted_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "message_text_search" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", COALESCE("message_text", ''::"text"))) STORED
);


ALTER TABLE "public"."slack_archive_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slack_archive_sync_state" (
    "channel_id" "text" NOT NULL,
    "last_ts" "text",
    "last_run_at" timestamp with time zone,
    "last_status" "text",
    "last_error" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "slack_archive_sync_state_last_status_check" CHECK (("last_status" = ANY (ARRAY['ok'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."slack_archive_sync_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" DEFAULT 'each'::"text" NOT NULL,
    "on_hand" numeric(10,2) DEFAULT 0 NOT NULL,
    "reorder_threshold" numeric(10,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "reorder_contact_id" "uuid",
    "reorder_note" "text",
    CONSTRAINT "supplies_qty_nonnegative" CHECK ((("on_hand" >= (0)::numeric) AND ("reorder_threshold" >= (0)::numeric)))
);


ALTER TABLE "public"."supplies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supply_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supply_id" "uuid" NOT NULL,
    "qty_used" numeric(10,2) NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "used_by" "uuid",
    "pm_instance_asset_id" "uuid",
    "pm_instance_id" "uuid",
    "maintenance_request_id" "uuid",
    "notes" "text",
    CONSTRAINT "supply_usage_one_source" CHECK ((((
CASE
    WHEN ("pm_instance_asset_id" IS NULL) THEN 0
    ELSE 1
END +
CASE
    WHEN ("pm_instance_id" IS NULL) THEN 0
    ELSE 1
END) +
CASE
    WHEN ("maintenance_request_id" IS NULL) THEN 0
    ELSE 1
END) <= 1)),
    CONSTRAINT "supply_usage_qty_positive" CHECK (("qty_used" > (0)::numeric))
);


ALTER TABLE "public"."supply_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "chip_class" "text" DEFAULT 'rsd-chip-mute'::"text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."task_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_review_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "old_status" "text",
    "new_status" "text",
    "reason" "text"
);


ALTER TABLE "public"."task_review_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "parent_id" "uuid",
    "external_author" "text",
    "slack_ts" "text",
    "recording_id" "uuid",
    CONSTRAINT "ticket_comments_body_check" CHECK (("length"(TRIM(BOTH FROM "body")) > 0))
);


ALTER TABLE "public"."ticket_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."volunteer_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "chip_class" "text" DEFAULT 'rsd-chip-mute'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."volunteer_teams" OWNER TO "postgres";


ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_supplies"
    ADD CONSTRAINT "asset_supplies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_supplies"
    ADD CONSTRAINT "asset_supplies_unique" UNIQUE ("asset_id", "supply_id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."building_requests"
    ADD CONSTRAINT "building_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."closure_reasons"
    ADD CONSTRAINT "closure_reasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."closures"
    ADD CONSTRAINT "closures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_categories"
    ADD CONSTRAINT "contact_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_links"
    ADD CONSTRAINT "contact_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reel_notes_action_items"
    ADD CONSTRAINT "daves_idea_action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reel_notes_recordings"
    ADD CONSTRAINT "daves_idea_recordings_assemblyai_id_key" UNIQUE ("assemblyai_id");



ALTER TABLE ONLY "public"."reel_notes_recordings"
    ADD CONSTRAINT "daves_idea_recordings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_categories"
    ADD CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_audit_log"
    ADD CONSTRAINT "member_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_volunteer_teams"
    ADD CONSTRAINT "member_ministries_pkey" PRIMARY KEY ("member_id", "team_id");



ALTER TABLE ONLY "public"."member_relationships"
    ADD CONSTRAINT "member_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_relationships"
    ADD CONSTRAINT "member_relationships_unique" UNIQUE ("member_id", "related_member_id", "relationship");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."members_notes"
    ADD CONSTRAINT "members_notes_pkey" PRIMARY KEY ("member_id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."volunteer_teams"
    ADD CONSTRAINT "ministry_teams_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."volunteer_teams"
    ADD CONSTRAINT "ministry_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playbook_categories"
    ADD CONSTRAINT "playbook_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playbook_procedures"
    ADD CONSTRAINT "playbook_procedures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playbook_versions"
    ADD CONSTRAINT "playbook_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playbooks"
    ADD CONSTRAINT "playbooks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pm_instance_assets"
    ADD CONSTRAINT "pm_instance_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pm_instance_assets"
    ADD CONSTRAINT "pm_instance_assets_unique" UNIQUE ("instance_id", "asset_id");



ALTER TABLE ONLY "public"."pm_instances"
    ADD CONSTRAINT "pm_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pm_templates"
    ADD CONSTRAINT "pm_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."priorities"
    ADD CONSTRAINT "priorities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."procedure_runs"
    ADD CONSTRAINT "procedure_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_votes"
    ADD CONSTRAINT "request_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_votes"
    ADD CONSTRAINT "request_votes_ticket_id_voter_id_key" UNIQUE ("ticket_id", "voter_id");



ALTER TABLE ONLY "public"."slack_archive_channel_members"
    ADD CONSTRAINT "slack_archive_channel_members_pkey" PRIMARY KEY ("channel_id", "member_id");



ALTER TABLE ONLY "public"."slack_archive_channels"
    ADD CONSTRAINT "slack_archive_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slack_archive_messages"
    ADD CONSTRAINT "slack_archive_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slack_archive_sync_state"
    ADD CONSTRAINT "slack_archive_sync_state_pkey" PRIMARY KEY ("channel_id");



ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_usage"
    ADD CONSTRAINT "supply_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_categories"
    ADD CONSTRAINT "task_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_review_log"
    ADD CONSTRAINT "task_review_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "areas_name_active_uniq" ON "public"."areas" USING "btree" ("lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "areas_responsible_team_idx" ON "public"."areas" USING "btree" ("responsible_team_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "areas_sort_idx" ON "public"."areas" USING "btree" ("sort_order", "name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "asset_supplies_asset_idx" ON "public"."asset_supplies" USING "btree" ("asset_id");



CREATE INDEX "asset_supplies_supply_idx" ON "public"."asset_supplies" USING "btree" ("supply_id");



CREATE INDEX "assets_area_active_idx" ON "public"."assets" USING "btree" ("area_id") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "assets_name_active_uniq" ON "public"."assets" USING "btree" ("lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "assets_search_idx" ON "public"."assets" USING "gin" ((((COALESCE("name", ''::"text") || ' '::"text") || COALESCE("type", ''::"text"))) "public"."gin_trgm_ops") WHERE ("deleted_at" IS NULL);



CREATE INDEX "assets_type_active_idx" ON "public"."assets" USING "btree" ("type") WHERE (("deleted_at" IS NULL) AND ("type" IS NOT NULL));



CREATE UNIQUE INDEX "closures_one_open_idx" ON "public"."closures" USING "btree" ((true)) WHERE (("cleared_at" IS NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "contact_categories_name_active_uniq" ON "public"."contact_categories" USING "btree" ("lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "contact_categories_sort_idx" ON "public"."contact_categories" USING "btree" ("sort_order", "name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "contact_links_contact_idx" ON "public"."contact_links" USING "btree" ("contact_id");



CREATE INDEX "contact_links_entity_idx" ON "public"."contact_links" USING "btree" ("entity_type", "entity_id");



CREATE UNIQUE INDEX "contact_links_unique" ON "public"."contact_links" USING "btree" ("contact_id", "entity_type", "entity_id", COALESCE("role", ''::"text"));



CREATE INDEX "contacts_category_idx" ON "public"."contacts" USING "btree" ("category_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "contacts_kind_idx" ON "public"."contacts" USING "btree" ("kind") WHERE ("deleted_at" IS NULL);



CREATE INDEX "contacts_name_idx" ON "public"."contacts" USING "btree" ("lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "contacts_parent_idx" ON "public"."contacts" USING "btree" ("parent_contact_id") WHERE (("deleted_at" IS NULL) AND ("parent_contact_id" IS NOT NULL));



CREATE INDEX "contacts_tags_gin" ON "public"."contacts" USING "gin" ("tags") WHERE ("deleted_at" IS NULL);



CREATE INDEX "daves_idea_action_items_owner_idx" ON "public"."reel_notes_action_items" USING "btree" ("owner_member_id") WHERE ("owner_member_id" IS NOT NULL);



CREATE INDEX "daves_idea_action_items_recording_idx" ON "public"."reel_notes_action_items" USING "btree" ("recording_id", "sort_order");



CREATE INDEX "daves_idea_recordings_assemblyai_idx" ON "public"."reel_notes_recordings" USING "btree" ("assemblyai_id") WHERE ("assemblyai_id" IS NOT NULL);



CREATE INDEX "daves_idea_recordings_user_idx" ON "public"."reel_notes_recordings" USING "btree" ("user_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "event_categories_name_active_uniq" ON "public"."event_categories" USING "btree" ("lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "event_categories_sort_idx" ON "public"."event_categories" USING "btree" ("sort_order", "name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "events_category_id_active_idx" ON "public"."events" USING "btree" ("category_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "events_search_idx" ON "public"."events" USING "gin" ((((((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("description", ''::"text")) || ' '::"text") || COALESCE("location", ''::"text"))) "public"."gin_trgm_ops") WHERE ("deleted_at" IS NULL);



CREATE INDEX "events_shutdown_playbook_idx" ON "public"."events" USING "btree" ("shutdown_playbook_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "events_start_active_idx" ON "public"."events" USING "btree" ("start_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_area_idx" ON "public"."maintenance_requests" USING "btree" ("area_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_assigned_idx" ON "public"."maintenance_requests" USING "btree" ("assigned_to") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_category_idx" ON "public"."maintenance_requests" USING "btree" ("category_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_due_on_idx" ON "public"."maintenance_requests" USING "btree" ("due_on") WHERE (("deleted_at" IS NULL) AND ("due_on" IS NOT NULL));



CREATE INDEX "maintenance_requests_event_idx" ON "public"."maintenance_requests" USING "btree" ("event_id") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "maintenance_requests_event_occurrence_uniq" ON "public"."maintenance_requests" USING "btree" ("event_id", "occurrence_date") WHERE (("event_id" IS NOT NULL) AND ("occurrence_date" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "maintenance_requests_parent_idx" ON "public"."maintenance_requests" USING "btree" ("parent_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_project_idx" ON "public"."maintenance_requests" USING "btree" ("project_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_review_status_idx" ON "public"."maintenance_requests" USING "btree" ("review_status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_search_idx" ON "public"."maintenance_requests" USING "gin" ("description" "public"."gin_trgm_ops") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_slack_ts_idx" ON "public"."maintenance_requests" USING "btree" ("slack_message_ts") WHERE ("slack_message_ts" IS NOT NULL);



CREATE INDEX "maintenance_requests_someday_idx" ON "public"."maintenance_requests" USING "btree" ("someday") WHERE (("deleted_at" IS NULL) AND ("someday" = true));



CREATE INDEX "maintenance_requests_start_on_idx" ON "public"."maintenance_requests" USING "btree" ("start_on") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_status_idx" ON "public"."maintenance_requests" USING "btree" ("status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "maintenance_requests_submitter_idx" ON "public"."maintenance_requests" USING "btree" ("submitted_by") WHERE ("deleted_at" IS NULL);



CREATE INDEX "member_audit_log_changed_at_idx" ON "public"."member_audit_log" USING "btree" ("changed_at" DESC);



CREATE INDEX "member_audit_log_member_idx" ON "public"."member_audit_log" USING "btree" ("member_id", "changed_at" DESC);



CREATE INDEX "member_relationships_member_idx" ON "public"."member_relationships" USING "btree" ("member_id", "relationship");



CREATE INDEX "member_relationships_related_idx" ON "public"."member_relationships" USING "btree" ("related_member_id", "relationship");



CREATE INDEX "member_volunteer_teams_team_idx" ON "public"."member_volunteer_teams" USING "btree" ("team_id");



CREATE UNIQUE INDEX "members_email_active_uniq" ON "public"."members" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE INDEX "members_search_idx" ON "public"."members" USING "gin" ((((((((((((COALESCE("full_name", ''::"text") || ' '::"text") || COALESCE("nickname", ''::"text")) || ' '::"text") || COALESCE("email", ''::"text")) || ' '::"text") || COALESCE("phone", ''::"text")) || ' '::"text") || COALESCE("home_phone", ''::"text")) || ' '::"text") || COALESCE("address", ''::"text"))) "public"."gin_trgm_ops") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "playbook_categories_name_active_uniq" ON "public"."playbook_categories" USING "btree" ("lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "playbook_categories_sort_idx" ON "public"."playbook_categories" USING "btree" ("sort_order", "name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "playbook_procedures_playbook_idx" ON "public"."playbook_procedures" USING "btree" ("playbook_id", "sort_order") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "playbook_versions_per_playbook_uniq" ON "public"."playbook_versions" USING "btree" ("playbook_id", "version_number") WHERE ("playbook_id" IS NOT NULL);



CREATE INDEX "playbook_versions_playbook_idx" ON "public"."playbook_versions" USING "btree" ("playbook_id", "changed_at" DESC);



CREATE INDEX "playbooks_category_active_idx" ON "public"."playbooks" USING "btree" ("category_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "playbooks_search_idx" ON "public"."playbooks" USING "gin" ("body_search" "public"."gin_trgm_ops") WHERE ("deleted_at" IS NULL);



CREATE INDEX "playbooks_updated_active_idx" ON "public"."playbooks" USING "btree" ("updated_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "pm_instance_assets_asset_history_idx" ON "public"."pm_instance_assets" USING "btree" ("asset_id", "created_at" DESC);



CREATE INDEX "pm_instance_assets_instance_idx" ON "public"."pm_instance_assets" USING "btree" ("instance_id");



CREATE INDEX "pm_instance_assets_status_idx" ON "public"."pm_instance_assets" USING "btree" ("status");



CREATE INDEX "pm_instances_area_idx" ON "public"."pm_instances" USING "btree" ("area_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "pm_instances_search_idx" ON "public"."pm_instances" USING "gin" ((((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("description", ''::"text"))) "public"."gin_trgm_ops") WHERE ("deleted_at" IS NULL);



CREATE INDEX "pm_instances_status_idx" ON "public"."pm_instances" USING "btree" ("status", "scheduled_for") WHERE ("deleted_at" IS NULL);



CREATE INDEX "pm_instances_template_completed_idx" ON "public"."pm_instances" USING "btree" ("template_id", "completed_at" DESC) WHERE (("status" = 'done'::"text") AND ("completed_at" IS NOT NULL));



CREATE INDEX "pm_instances_template_status_active_idx" ON "public"."pm_instances" USING "btree" ("template_id", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "pm_templates_active_idx" ON "public"."pm_templates" USING "btree" ("active", "title") WHERE ("deleted_at" IS NULL);



CREATE INDEX "pm_templates_search_idx" ON "public"."pm_templates" USING "gin" ((((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("description", ''::"text"))) "public"."gin_trgm_ops") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "priorities_key_active_uniq" ON "public"."priorities" USING "btree" ("key") WHERE ("deleted_at" IS NULL);



CREATE INDEX "priorities_severity_idx" ON "public"."priorities" USING "btree" ("severity" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "procedure_runs_procedure_idx" ON "public"."procedure_runs" USING "btree" ("procedure_id", "ran_at" DESC);



CREATE INDEX "projects_creator_idx" ON "public"."projects" USING "btree" ("created_by") WHERE ("deleted_at" IS NULL);



CREATE INDEX "projects_status_idx" ON "public"."projects" USING "btree" ("status", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "reel_notes_recordings_linked_entity_idx" ON "public"."reel_notes_recordings" USING "btree" ("linked_entity_type", "linked_entity_id") WHERE ("linked_entity_id" IS NOT NULL);



CREATE INDEX "request_votes_ticket_idx" ON "public"."request_votes" USING "btree" ("ticket_id");



CREATE INDEX "slack_archive_channel_members_member_idx" ON "public"."slack_archive_channel_members" USING "btree" ("member_id");



CREATE UNIQUE INDEX "slack_archive_channels_slack_id_key" ON "public"."slack_archive_channels" USING "btree" ("slack_channel_id");



CREATE INDEX "slack_archive_messages_author_posted_idx" ON "public"."slack_archive_messages" USING "btree" ("author_name", "posted_at") WHERE ("author_name" IS NOT NULL);



CREATE INDEX "slack_archive_messages_channel_posted_idx" ON "public"."slack_archive_messages" USING "btree" ("channel_id", "posted_at");



CREATE INDEX "slack_archive_messages_channel_thread_idx" ON "public"."slack_archive_messages" USING "btree" ("channel_id", "thread_ts") WHERE ("thread_ts" IS NOT NULL);



CREATE UNIQUE INDEX "slack_archive_messages_channel_ts_key" ON "public"."slack_archive_messages" USING "btree" ("channel_id", "ts");



CREATE INDEX "slack_archive_messages_text_search_idx" ON "public"."slack_archive_messages" USING "gin" ("message_text_search");



CREATE UNIQUE INDEX "supplies_name_active_uniq" ON "public"."supplies" USING "btree" ("lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "supply_usage_pm_asset_idx" ON "public"."supply_usage" USING "btree" ("pm_instance_asset_id") WHERE ("pm_instance_asset_id" IS NOT NULL);



CREATE INDEX "supply_usage_pm_instance_idx" ON "public"."supply_usage" USING "btree" ("pm_instance_id") WHERE ("pm_instance_id" IS NOT NULL);



CREATE INDEX "supply_usage_supply_idx" ON "public"."supply_usage" USING "btree" ("supply_id", "used_at" DESC);



CREATE INDEX "supply_usage_ticket_idx" ON "public"."supply_usage" USING "btree" ("maintenance_request_id") WHERE ("maintenance_request_id" IS NOT NULL);



CREATE UNIQUE INDEX "task_categories_name_active_uniq" ON "public"."task_categories" USING "btree" ("lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "task_categories_sort_idx" ON "public"."task_categories" USING "btree" ("sort_order", "name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "task_review_log_ticket_idx" ON "public"."task_review_log" USING "btree" ("ticket_id");



CREATE INDEX "ticket_comments_body_search_idx" ON "public"."ticket_comments" USING "gin" ("body" "public"."gin_trgm_ops") WHERE ("deleted_at" IS NULL);



CREATE INDEX "ticket_comments_parent_idx" ON "public"."ticket_comments" USING "btree" ("parent_id") WHERE (("parent_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "ticket_comments_recording_idx" ON "public"."ticket_comments" USING "btree" ("recording_id") WHERE ("recording_id" IS NOT NULL);



CREATE UNIQUE INDEX "ticket_comments_recording_uniq" ON "public"."ticket_comments" USING "btree" ("recording_id") WHERE (("recording_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "ticket_comments_slack_ts_key" ON "public"."ticket_comments" USING "btree" ("slack_ts") WHERE ("slack_ts" IS NOT NULL);



CREATE INDEX "ticket_comments_ticket_idx" ON "public"."ticket_comments" USING "btree" ("ticket_id", "created_at") WHERE ("deleted_at" IS NULL);



CREATE OR REPLACE TRIGGER "assets_set_updated_at" BEFORE UPDATE ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "closure_reasons_updated_at" BEFORE UPDATE ON "public"."closure_reasons" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "closures_set_audit_fields" BEFORE INSERT OR UPDATE ON "public"."closures" FOR EACH ROW EXECUTE FUNCTION "public"."closures_set_audit_fields"();



CREATE OR REPLACE TRIGGER "contact_categories_set_updated_at" BEFORE UPDATE ON "public"."contact_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "contacts_set_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "daves_idea_action_items_set_updated_at" BEFORE UPDATE ON "public"."reel_notes_action_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "daves_idea_recordings_set_updated_at" BEFORE UPDATE ON "public"."reel_notes_recordings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "event_categories_set_updated_at" BEFORE UPDATE ON "public"."event_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "events_set_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "guard_member_privilege_changes" BEFORE INSERT OR UPDATE ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."guard_member_privilege_changes"();



CREATE OR REPLACE TRIGGER "maintenance_requests_review_log" AFTER UPDATE ON "public"."maintenance_requests" FOR EACH ROW EXECUTE FUNCTION "public"."log_task_review"();



CREATE OR REPLACE TRIGGER "maintenance_requests_set_updated_at" BEFORE UPDATE ON "public"."maintenance_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "members_audit_after" AFTER INSERT OR DELETE OR UPDATE ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."members_write_audit_log"();



CREATE OR REPLACE TRIGGER "members_enforce_self_update_columns" BEFORE UPDATE ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."members_enforce_self_update_columns"();



CREATE OR REPLACE TRIGGER "members_notes_set_updated_at" BEFORE UPDATE ON "public"."members_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "playbook_categories_set_updated_at" BEFORE UPDATE ON "public"."playbook_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "playbook_procedures_set_audit_fields" BEFORE INSERT OR UPDATE ON "public"."playbook_procedures" FOR EACH ROW EXECUTE FUNCTION "public"."playbook_procedures_set_audit_fields"();



CREATE OR REPLACE TRIGGER "playbooks_body_search" BEFORE INSERT OR UPDATE OF "title", "excerpt", "body_md" ON "public"."playbooks" FOR EACH ROW EXECUTE FUNCTION "public"."playbooks_refresh_body_search"();



CREATE OR REPLACE TRIGGER "playbooks_set_audit_fields" BEFORE INSERT OR UPDATE ON "public"."playbooks" FOR EACH ROW EXECUTE FUNCTION "public"."playbooks_set_audit_fields"();



CREATE OR REPLACE TRIGGER "playbooks_write_version" AFTER INSERT OR UPDATE ON "public"."playbooks" FOR EACH ROW EXECUTE FUNCTION "public"."playbooks_write_version"();



CREATE OR REPLACE TRIGGER "pm_instance_assets_set_updated_at" BEFORE UPDATE ON "public"."pm_instance_assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "pm_instances_set_updated_at" BEFORE UPDATE ON "public"."pm_instances" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "pm_templates_set_updated_at" BEFORE UPDATE ON "public"."pm_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "projects_set_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "slack_archive_channels_set_updated_at" BEFORE UPDATE ON "public"."slack_archive_channels" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "slack_archive_messages_set_updated_at" BEFORE UPDATE ON "public"."slack_archive_messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "slack_archive_sync_state_set_updated_at" BEFORE UPDATE ON "public"."slack_archive_sync_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "supplies_set_updated_at" BEFORE UPDATE ON "public"."supplies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "task_categories_set_updated_at" BEFORE UPDATE ON "public"."task_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ticket_comments_set_updated_at" BEFORE UPDATE ON "public"."ticket_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_responsible_team_id_fkey" FOREIGN KEY ("responsible_team_id") REFERENCES "public"."volunteer_teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_supplies"
    ADD CONSTRAINT "asset_supplies_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_supplies"
    ADD CONSTRAINT "asset_supplies_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id");



ALTER TABLE ONLY "public"."building_requests"
    ADD CONSTRAINT "building_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."closures"
    ADD CONSTRAINT "closures_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."closures"
    ADD CONSTRAINT "closures_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "public"."closure_reasons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."closures"
    ADD CONSTRAINT "closures_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contact_links"
    ADD CONSTRAINT "contact_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_links"
    ADD CONSTRAINT "contact_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."contact_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_parent_contact_id_fkey" FOREIGN KEY ("parent_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reel_notes_action_items"
    ADD CONSTRAINT "daves_idea_action_items_owner_member_id_fkey" FOREIGN KEY ("owner_member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reel_notes_action_items"
    ADD CONSTRAINT "daves_idea_action_items_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "public"."reel_notes_recordings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reel_notes_action_items"
    ADD CONSTRAINT "daves_idea_action_items_suggested_member_id_fkey" FOREIGN KEY ("suggested_member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reel_notes_recordings"
    ADD CONSTRAINT "daves_idea_recordings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."event_categories"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_shutdown_playbook_id_fkey" FOREIGN KEY ("shutdown_playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_shutdown_procedure_id_fkey" FOREIGN KEY ("shutdown_procedure_id") REFERENCES "public"."playbook_procedures"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_source_ticket_id_fkey" FOREIGN KEY ("source_ticket_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id");



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."task_categories"("id");



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id");



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_user_id_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."member_audit_log"
    ADD CONSTRAINT "member_audit_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."member_volunteer_teams"
    ADD CONSTRAINT "member_ministries_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_volunteer_teams"
    ADD CONSTRAINT "member_ministries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."volunteer_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_relationships"
    ADD CONSTRAINT "member_relationships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_relationships"
    ADD CONSTRAINT "member_relationships_related_member_id_fkey" FOREIGN KEY ("related_member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members_notes"
    ADD CONSTRAINT "members_notes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members_notes"
    ADD CONSTRAINT "members_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playbook_procedures"
    ADD CONSTRAINT "playbook_procedures_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."playbook_procedures"
    ADD CONSTRAINT "playbook_procedures_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playbook_procedures"
    ADD CONSTRAINT "playbook_procedures_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."playbook_versions"
    ADD CONSTRAINT "playbook_versions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."playbook_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playbook_versions"
    ADD CONSTRAINT "playbook_versions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."playbook_versions"
    ADD CONSTRAINT "playbook_versions_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playbooks"
    ADD CONSTRAINT "playbooks_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."playbook_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."playbooks"
    ADD CONSTRAINT "playbooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."playbooks"
    ADD CONSTRAINT "playbooks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pm_instance_assets"
    ADD CONSTRAINT "pm_instance_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id");



ALTER TABLE ONLY "public"."pm_instance_assets"
    ADD CONSTRAINT "pm_instance_assets_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."pm_instance_assets"
    ADD CONSTRAINT "pm_instance_assets_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."pm_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pm_instances"
    ADD CONSTRAINT "pm_instances_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id");



ALTER TABLE ONLY "public"."pm_instances"
    ADD CONSTRAINT "pm_instances_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."pm_instances"
    ADD CONSTRAINT "pm_instances_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id");



ALTER TABLE ONLY "public"."pm_instances"
    ADD CONSTRAINT "pm_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."pm_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pm_templates"
    ADD CONSTRAINT "pm_templates_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id");



ALTER TABLE ONLY "public"."pm_templates"
    ADD CONSTRAINT "pm_templates_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id");



ALTER TABLE ONLY "public"."procedure_runs"
    ADD CONSTRAINT "procedure_runs_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "public"."playbook_procedures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."procedure_runs"
    ADD CONSTRAINT "procedure_runs_ran_by_fkey" FOREIGN KEY ("ran_by") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."task_categories"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reel_notes_action_items"
    ADD CONSTRAINT "reel_notes_action_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."request_votes"
    ADD CONSTRAINT "request_votes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."request_votes"
    ADD CONSTRAINT "request_votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slack_archive_channel_members"
    ADD CONSTRAINT "slack_archive_channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."slack_archive_channels"("slack_channel_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slack_archive_channel_members"
    ADD CONSTRAINT "slack_archive_channel_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slack_archive_channels"
    ADD CONSTRAINT "slack_archive_channels_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."slack_archive_messages"
    ADD CONSTRAINT "slack_archive_messages_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_reorder_contact_id_fkey" FOREIGN KEY ("reorder_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supply_usage"
    ADD CONSTRAINT "supply_usage_maintenance_request_id_fkey" FOREIGN KEY ("maintenance_request_id") REFERENCES "public"."maintenance_requests"("id");



ALTER TABLE ONLY "public"."supply_usage"
    ADD CONSTRAINT "supply_usage_pm_instance_asset_id_fkey" FOREIGN KEY ("pm_instance_asset_id") REFERENCES "public"."pm_instance_assets"("id");



ALTER TABLE ONLY "public"."supply_usage"
    ADD CONSTRAINT "supply_usage_pm_instance_id_fkey" FOREIGN KEY ("pm_instance_id") REFERENCES "public"."pm_instances"("id");



ALTER TABLE ONLY "public"."supply_usage"
    ADD CONSTRAINT "supply_usage_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id");



ALTER TABLE ONLY "public"."supply_usage"
    ADD CONSTRAINT "supply_usage_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."task_review_log"
    ADD CONSTRAINT "task_review_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_review_log"
    ADD CONSTRAINT "task_review_log_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."ticket_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "public"."reel_notes_recordings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can view building requests" ON "public"."building_requests" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Members can submit building requests" ON "public"."building_requests" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "areas_delete_super" ON "public"."areas" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "areas_insert_staff" ON "public"."areas" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "areas_select_active" ON "public"."areas" FOR SELECT TO "authenticated", "anon" USING (("deleted_at" IS NULL));



CREATE POLICY "areas_select_deleted_super" ON "public"."areas" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "areas_update_staff" ON "public"."areas" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "areas_update_super" ON "public"."areas" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."asset_supplies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asset_supplies_delete_staff" ON "public"."asset_supplies" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "asset_supplies_insert_staff" ON "public"."asset_supplies" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "asset_supplies_select_staff" ON "public"."asset_supplies" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "asset_supplies_update_staff" ON "public"."asset_supplies" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff")) WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assets_delete_super" ON "public"."assets" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "assets_insert_staff" ON "public"."assets" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "assets_select_deleted_super" ON "public"."assets" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "assets_select_staff" ON "public"."assets" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ( SELECT "public"."is_staff"() AS "is_staff")));



CREATE POLICY "assets_update_staff" ON "public"."assets" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "assets_update_super" ON "public"."assets" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."building_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."closure_reasons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "closure_reasons_delete_super" ON "public"."closure_reasons" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "closure_reasons_insert_staff" ON "public"."closure_reasons" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "closure_reasons_select_authenticated" ON "public"."closure_reasons" FOR SELECT TO "authenticated" USING (("deleted_at" IS NULL));



CREATE POLICY "closure_reasons_select_deleted_super" ON "public"."closure_reasons" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "closure_reasons_update_staff" ON "public"."closure_reasons" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff")) WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."closures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "closures_delete_super" ON "public"."closures" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "closures_insert_staff" ON "public"."closures" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "closures_select_anon_open" ON "public"."closures" FOR SELECT TO "anon" USING ((("cleared_at" IS NULL) AND ("deleted_at" IS NULL)));



CREATE POLICY "closures_select_authenticated" ON "public"."closures" FOR SELECT TO "authenticated" USING (("deleted_at" IS NULL));



CREATE POLICY "closures_select_deleted_super" ON "public"."closures" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "closures_update_staff" ON "public"."closures" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff")) WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."contact_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_categories_delete_super" ON "public"."contact_categories" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "contact_categories_insert_staff" ON "public"."contact_categories" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "contact_categories_select_staff" ON "public"."contact_categories" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "contact_categories_update_staff" ON "public"."contact_categories" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "contact_categories_update_super" ON "public"."contact_categories" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."contact_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_links_delete_staff" ON "public"."contact_links" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "contact_links_insert_staff" ON "public"."contact_links" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "contact_links_select_staff" ON "public"."contact_links" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_delete_super" ON "public"."contacts" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "contacts_insert_staff" ON "public"."contacts" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "contacts_select_deleted_super" ON "public"."contacts" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "contacts_select_staff" ON "public"."contacts" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "contacts_update_staff" ON "public"."contacts" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "contacts_update_super" ON "public"."contacts" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "daves_idea_action_items_delete_own" ON "public"."reel_notes_action_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."reel_notes_recordings" "r"
  WHERE (("r"."id" = "reel_notes_action_items"."recording_id") AND ("r"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."deleted_at" IS NULL)))));



CREATE POLICY "daves_idea_action_items_insert_own" ON "public"."reel_notes_action_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."reel_notes_recordings" "r"
  WHERE (("r"."id" = "reel_notes_action_items"."recording_id") AND ("r"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."deleted_at" IS NULL)))));



CREATE POLICY "daves_idea_action_items_select_own" ON "public"."reel_notes_action_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."reel_notes_recordings" "r"
  WHERE (("r"."id" = "reel_notes_action_items"."recording_id") AND ("r"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."deleted_at" IS NULL)))));



CREATE POLICY "daves_idea_action_items_update_own" ON "public"."reel_notes_action_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."reel_notes_recordings" "r"
  WHERE (("r"."id" = "reel_notes_action_items"."recording_id") AND ("r"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."deleted_at" IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."reel_notes_recordings" "r"
  WHERE (("r"."id" = "reel_notes_action_items"."recording_id") AND ("r"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."deleted_at" IS NULL)))));



CREATE POLICY "daves_idea_recordings_delete_own" ON "public"."reel_notes_recordings" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("deleted_at" IS NOT NULL)));



CREATE POLICY "daves_idea_recordings_insert_own" ON "public"."reel_notes_recordings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "daves_idea_recordings_select_own" ON "public"."reel_notes_recordings" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "daves_idea_recordings_update_own" ON "public"."reel_notes_recordings" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."event_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_categories_delete_super" ON "public"."event_categories" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "event_categories_insert_staff" ON "public"."event_categories" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "event_categories_select_approved" ON "public"."event_categories" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND (( SELECT "public"."is_approved"() AS "is_approved") OR ( SELECT "public"."is_staff"() AS "is_staff"))));



CREATE POLICY "event_categories_select_deleted_super" ON "public"."event_categories" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "event_categories_update_staff" ON "public"."event_categories" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "event_categories_update_super" ON "public"."event_categories" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_delete_super" ON "public"."events" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "events_insert_staff" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "events_select_approved" ON "public"."events" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND (( SELECT "public"."is_approved"() AS "is_approved") OR ( SELECT "public"."is_staff"() AS "is_staff"))));



CREATE POLICY "events_select_deleted_super" ON "public"."events" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "events_update_staff" ON "public"."events" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "events_update_super" ON "public"."events" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "maintenance_delete_super" ON "public"."maintenance_requests" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "maintenance_insert" ON "public"."maintenance_requests" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") OR (("submitted_by" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_approved"() AS "is_approved") AND (("parent_id" IS NULL) OR "public"."owns_task"("parent_id")))));



ALTER TABLE "public"."maintenance_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "maintenance_select_assignee" ON "public"."maintenance_requests" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ("assigned_to" IN ( SELECT "members"."id"
   FROM "public"."members"
  WHERE (("members"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("members"."deleted_at" IS NULL))))));



CREATE POLICY "maintenance_select_deleted_super" ON "public"."maintenance_requests" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "maintenance_select_own_subtask" ON "public"."maintenance_requests" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND "public"."owns_task"("parent_id")));



CREATE POLICY "maintenance_select_self" ON "public"."maintenance_requests" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ("submitted_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "maintenance_select_staff" ON "public"."maintenance_requests" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ( SELECT "public"."is_staff"() AS "is_staff")));



CREATE POLICY "maintenance_update_staff" ON "public"."maintenance_requests" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "maintenance_update_super" ON "public"."maintenance_requests" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."member_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_audit_log_select_staff" ON "public"."member_audit_log" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."member_relationships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_relationships_delete_super" ON "public"."member_relationships" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "member_relationships_insert_super" ON "public"."member_relationships" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "member_relationships_select_approved" ON "public"."member_relationships" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_approved"() AS "is_approved"));



ALTER TABLE "public"."member_volunteer_teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_volunteer_teams_delete_staff" ON "public"."member_volunteer_teams" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "member_volunteer_teams_insert_staff" ON "public"."member_volunteer_teams" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "member_volunteer_teams_select_approved" ON "public"."member_volunteer_teams" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_approved"() AS "is_approved"));



CREATE POLICY "member_volunteer_teams_update_staff" ON "public"."member_volunteer_teams" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff")) WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_directory_select" ON "public"."members" FOR SELECT TO "authenticated" USING ((("status" = 'approved'::"text") AND ("deleted_at" IS NULL) AND ( SELECT "public"."is_approved"() AS "is_approved")));



ALTER TABLE "public"."members_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_notes_delete_staff" ON "public"."members_notes" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "members_notes_insert_staff" ON "public"."members_notes" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "members_notes_select_staff" ON "public"."members_notes" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "members_notes_update_staff" ON "public"."members_notes" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff")) WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "members_self_insert" ON "public"."members" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "members_self_select" ON "public"."members" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("deleted_at" IS NULL)));



CREATE POLICY "members_self_update" ON "public"."members" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "members_staff_select_all" ON "public"."members" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "members_staff_update" ON "public"."members" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "members_super_delete" ON "public"."members" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "members_super_insert" ON "public"."members" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "members_super_select_all" ON "public"."members" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "members_super_update" ON "public"."members" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."playbook_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "playbook_categories_delete_super" ON "public"."playbook_categories" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "playbook_categories_insert_staff" ON "public"."playbook_categories" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "playbook_categories_select_approved" ON "public"."playbook_categories" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND (( SELECT "public"."is_approved"() AS "is_approved") OR ( SELECT "public"."is_staff"() AS "is_staff"))));



CREATE POLICY "playbook_categories_select_deleted_super" ON "public"."playbook_categories" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "playbook_categories_update_staff" ON "public"."playbook_categories" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "playbook_categories_update_super" ON "public"."playbook_categories" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."playbook_procedures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "playbook_procedures_delete_super" ON "public"."playbook_procedures" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "playbook_procedures_insert_staff" ON "public"."playbook_procedures" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "playbook_procedures_select_authenticated" ON "public"."playbook_procedures" FOR SELECT TO "authenticated" USING (("deleted_at" IS NULL));



CREATE POLICY "playbook_procedures_select_deleted_super" ON "public"."playbook_procedures" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "playbook_procedures_update_staff" ON "public"."playbook_procedures" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "playbook_procedures_update_super" ON "public"."playbook_procedures" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."playbook_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "playbook_versions_select_staff" ON "public"."playbook_versions" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."playbooks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "playbooks_delete_super" ON "public"."playbooks" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "playbooks_insert_staff" ON "public"."playbooks" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "playbooks_select_approved" ON "public"."playbooks" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND (( SELECT "public"."is_approved"() AS "is_approved") OR ( SELECT "public"."is_staff"() AS "is_staff"))));



CREATE POLICY "playbooks_select_deleted_super" ON "public"."playbooks" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "playbooks_update_staff" ON "public"."playbooks" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "playbooks_update_super" ON "public"."playbooks" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."pm_instance_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pm_instance_assets_delete_super" ON "public"."pm_instance_assets" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "pm_instance_assets_insert_staff" ON "public"."pm_instance_assets" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "pm_instance_assets_select_staff" ON "public"."pm_instance_assets" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "pm_instance_assets_update_staff" ON "public"."pm_instance_assets" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff")) WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."pm_instances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pm_instances_delete_super" ON "public"."pm_instances" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "pm_instances_insert_staff" ON "public"."pm_instances" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "pm_instances_select_deleted_super" ON "public"."pm_instances" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "pm_instances_select_staff" ON "public"."pm_instances" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ( SELECT "public"."is_staff"() AS "is_staff")));



CREATE POLICY "pm_instances_update_staff" ON "public"."pm_instances" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "pm_instances_update_super" ON "public"."pm_instances" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."pm_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pm_templates_delete_super" ON "public"."pm_templates" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "pm_templates_insert_staff" ON "public"."pm_templates" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "pm_templates_select_deleted_super" ON "public"."pm_templates" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "pm_templates_select_staff" ON "public"."pm_templates" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ( SELECT "public"."is_staff"() AS "is_staff")));



CREATE POLICY "pm_templates_update_staff" ON "public"."pm_templates" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "pm_templates_update_super" ON "public"."pm_templates" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."priorities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "priorities_delete_super" ON "public"."priorities" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "priorities_insert_staff" ON "public"."priorities" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "priorities_select_active" ON "public"."priorities" FOR SELECT TO "authenticated", "anon" USING (("deleted_at" IS NULL));



CREATE POLICY "priorities_select_deleted_super" ON "public"."priorities" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "priorities_update_staff" ON "public"."priorities" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "priorities_update_super" ON "public"."priorities" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."procedure_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "procedure_runs_select_staff" ON "public"."procedure_runs" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete_super" ON "public"."projects" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "projects_insert" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_staff"() AS "is_staff")));



CREATE POLICY "projects_select_deleted_super" ON "public"."projects" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "projects_select_self" ON "public"."projects" FOR SELECT TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("deleted_at" IS NULL)));



CREATE POLICY "projects_select_staff" ON "public"."projects" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "projects_update_staff" ON "public"."projects" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "projects_update_super" ON "public"."projects" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."reel_notes_action_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reel_notes_action_items_select_staff_linked" ON "public"."reel_notes_action_items" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND (EXISTS ( SELECT 1
   FROM "public"."reel_notes_recordings" "r"
  WHERE (("r"."id" = "reel_notes_action_items"."recording_id") AND ("r"."linked_entity_id" IS NOT NULL) AND ("r"."deleted_at" IS NULL))))));



CREATE POLICY "reel_notes_action_items_update_staff_linked" ON "public"."reel_notes_action_items" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND (EXISTS ( SELECT 1
   FROM "public"."reel_notes_recordings" "r"
  WHERE (("r"."id" = "reel_notes_action_items"."recording_id") AND ("r"."linked_entity_id" IS NOT NULL) AND ("r"."deleted_at" IS NULL)))))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND (EXISTS ( SELECT 1
   FROM "public"."reel_notes_recordings" "r"
  WHERE (("r"."id" = "reel_notes_action_items"."recording_id") AND ("r"."linked_entity_id" IS NOT NULL) AND ("r"."deleted_at" IS NULL))))));



ALTER TABLE "public"."reel_notes_recordings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reel_notes_recordings_select_staff_linked" ON "public"."reel_notes_recordings" FOR SELECT TO "authenticated" USING ((("linked_entity_id" IS NOT NULL) AND ("deleted_at" IS NULL) AND ( SELECT "public"."is_staff"() AS "is_staff")));



ALTER TABLE "public"."request_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "request_votes_select_staff" ON "public"."request_votes" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."slack_archive_channel_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slack_archive_channel_members_select_super" ON "public"."slack_archive_channel_members" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."slack_archive_channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slack_archive_channels_insert_super" ON "public"."slack_archive_channels" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "slack_archive_channels_select_visible" ON "public"."slack_archive_channels" FOR SELECT TO "authenticated" USING (("slack_channel_id" IN ( SELECT "public"."archive_visible_channel_ids"() AS "archive_visible_channel_ids")));



CREATE POLICY "slack_archive_channels_update_super" ON "public"."slack_archive_channels" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."slack_archive_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slack_archive_messages_select_visible" ON "public"."slack_archive_messages" FOR SELECT TO "authenticated" USING (("channel_id" IN ( SELECT "public"."archive_visible_channel_ids"() AS "archive_visible_channel_ids")));



ALTER TABLE "public"."slack_archive_sync_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slack_archive_sync_state_select_visible" ON "public"."slack_archive_sync_state" FOR SELECT TO "authenticated" USING (("channel_id" IN ( SELECT "public"."archive_visible_channel_ids"() AS "archive_visible_channel_ids")));



ALTER TABLE "public"."supplies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplies_delete_super" ON "public"."supplies" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "supplies_insert_staff" ON "public"."supplies" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "supplies_select_deleted_super" ON "public"."supplies" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "supplies_select_staff" ON "public"."supplies" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ( SELECT "public"."is_staff"() AS "is_staff")));



CREATE POLICY "supplies_update_staff" ON "public"."supplies" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "supplies_update_super" ON "public"."supplies" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."supply_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supply_usage_delete_super" ON "public"."supply_usage" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "supply_usage_insert_staff" ON "public"."supply_usage" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "supply_usage_select_staff" ON "public"."supply_usage" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "supply_usage_update_super" ON "public"."supply_usage" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."task_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_categories_delete_super" ON "public"."task_categories" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "task_categories_insert_staff" ON "public"."task_categories" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "task_categories_select_approved" ON "public"."task_categories" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND (( SELECT "public"."is_approved"() AS "is_approved") OR ( SELECT "public"."is_staff"() AS "is_staff"))));



CREATE POLICY "task_categories_select_deleted_super" ON "public"."task_categories" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "task_categories_update_staff" ON "public"."task_categories" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL))) WITH CHECK ((( SELECT "public"."is_staff"() AS "is_staff") AND ("deleted_at" IS NULL)));



CREATE POLICY "task_categories_update_super" ON "public"."task_categories" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."task_review_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_review_log_select_staff" ON "public"."task_review_log" FOR SELECT USING (( SELECT "public"."is_staff"() AS "is_staff"));



ALTER TABLE "public"."ticket_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_comments_delete_super" ON "public"."ticket_comments" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



CREATE POLICY "ticket_comments_insert" ON "public"."ticket_comments" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."maintenance_requests" "mr"
  WHERE (("mr"."id" = "ticket_comments"."ticket_id") AND ("mr"."deleted_at" IS NULL) AND (("mr"."submitted_by" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_staff"() AS "is_staff"))))) AND (EXISTS ( SELECT 1
   FROM "public"."members" "m"
  WHERE (("m"."id" = "ticket_comments"."author_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "ticket_comments_select" ON "public"."ticket_comments" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."maintenance_requests" "mr"
  WHERE (("mr"."id" = "ticket_comments"."ticket_id") AND ("mr"."deleted_at" IS NULL) AND (("mr"."submitted_by" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_staff"() AS "is_staff")))))));



CREATE POLICY "ticket_comments_select_deleted_super" ON "public"."ticket_comments" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NOT NULL) AND ( SELECT "public"."is_super_admin"() AS "is_super_admin")));



CREATE POLICY "ticket_comments_update_super" ON "public"."ticket_comments" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_super_admin"() AS "is_super_admin")) WITH CHECK (( SELECT "public"."is_super_admin"() AS "is_super_admin"));



ALTER TABLE "public"."volunteer_teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "volunteer_teams_delete_staff" ON "public"."volunteer_teams" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "volunteer_teams_insert_staff" ON "public"."volunteer_teams" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));



CREATE POLICY "volunteer_teams_select_approved" ON "public"."volunteer_teams" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_approved"() AS "is_approved"));



CREATE POLICY "volunteer_teams_update_staff" ON "public"."volunteer_teams" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_staff"() AS "is_staff")) WITH CHECK (( SELECT "public"."is_staff"() AS "is_staff"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."archive_author_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."archive_author_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_author_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_author_counts_filtered"("p_query" "text", "p_channel_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."archive_author_counts_filtered"("p_query" "text", "p_channel_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_author_counts_filtered"("p_query" "text", "p_channel_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_author_counts_for_query"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_author_counts_for_query"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_author_counts_for_query"("p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_channel_counts_filtered"("p_query" "text", "p_authors" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."archive_channel_counts_filtered"("p_query" "text", "p_authors" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_channel_counts_filtered"("p_query" "text", "p_authors" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_visible_channel_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_visible_channel_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."archive_visible_channel_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_visible_channel_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_delete_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_delete_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_delete_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_edit_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_undelete_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_undelete_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_undelete_settings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cast_request_vote"("p_ticket_id" "uuid", "p_vote" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cast_request_vote"("p_ticket_id" "uuid", "p_vote" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cast_request_vote"("p_ticket_id" "uuid", "p_vote" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cast_request_vote"("p_ticket_id" "uuid", "p_vote" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."closures_set_audit_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."closures_set_audit_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."closures_set_audit_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."decide_request"("p_ticket_id" "uuid", "p_decision" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."decide_request"("p_ticket_id" "uuid", "p_decision" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_request"("p_ticket_id" "uuid", "p_decision" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_supply"("p_supply_id" "uuid", "p_qty" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_supply"("p_supply_id" "uuid", "p_qty" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_supply"("p_supply_id" "uuid", "p_qty" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_member_privilege_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_member_privilege_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_member_privilege_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_approved"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_approved"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approved"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_task_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_task_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_task_review"() TO "service_role";



GRANT ALL ON FUNCTION "public"."members_enforce_self_update_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."members_enforce_self_update_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."members_enforce_self_update_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."members_write_audit_log"() TO "anon";
GRANT ALL ON FUNCTION "public"."members_write_audit_log"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."members_write_audit_log"() TO "service_role";



GRANT ALL ON FUNCTION "public"."owns_task"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."owns_task"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_task"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."playbook_procedures_set_audit_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."playbook_procedures_set_audit_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."playbook_procedures_set_audit_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."playbooks_refresh_body_search"() TO "anon";
GRANT ALL ON FUNCTION "public"."playbooks_refresh_body_search"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."playbooks_refresh_body_search"() TO "service_role";



GRANT ALL ON FUNCTION "public"."playbooks_set_audit_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."playbooks_set_audit_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."playbooks_set_audit_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."playbooks_write_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."playbooks_write_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."playbooks_write_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_global"("q" "text", "max_total" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_global"("q" "text", "max_total" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_global"("q" "text", "max_total" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strip_markdown"("md" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strip_markdown"("md" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strip_markdown"("md" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."areas" TO "anon";
GRANT ALL ON TABLE "public"."areas" TO "authenticated";
GRANT ALL ON TABLE "public"."areas" TO "service_role";



GRANT ALL ON TABLE "public"."asset_supplies" TO "anon";
GRANT ALL ON TABLE "public"."asset_supplies" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_supplies" TO "service_role";



GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."building_requests" TO "anon";
GRANT ALL ON TABLE "public"."building_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."building_requests" TO "service_role";



GRANT ALL ON TABLE "public"."closure_reasons" TO "anon";
GRANT ALL ON TABLE "public"."closure_reasons" TO "authenticated";
GRANT ALL ON TABLE "public"."closure_reasons" TO "service_role";



GRANT ALL ON TABLE "public"."closures" TO "anon";
GRANT ALL ON TABLE "public"."closures" TO "authenticated";
GRANT ALL ON TABLE "public"."closures" TO "service_role";



GRANT ALL ON TABLE "public"."contact_categories" TO "anon";
GRANT ALL ON TABLE "public"."contact_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_categories" TO "service_role";



GRANT ALL ON TABLE "public"."contact_links" TO "anon";
GRANT ALL ON TABLE "public"."contact_links" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_links" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."event_categories" TO "anon";
GRANT ALL ON TABLE "public"."event_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."event_categories" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_requests" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_requests" TO "service_role";



GRANT ALL ON TABLE "public"."member_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."member_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."member_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."member_relationships" TO "anon";
GRANT ALL ON TABLE "public"."member_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."member_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."member_volunteer_teams" TO "anon";
GRANT ALL ON TABLE "public"."member_volunteer_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."member_volunteer_teams" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "anon";
GRANT ALL ON TABLE "public"."members" TO "authenticated";
GRANT ALL ON TABLE "public"."members" TO "service_role";



GRANT ALL ON TABLE "public"."members_notes" TO "anon";
GRANT ALL ON TABLE "public"."members_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."members_notes" TO "service_role";



GRANT ALL ON TABLE "public"."playbook_categories" TO "anon";
GRANT ALL ON TABLE "public"."playbook_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."playbook_categories" TO "service_role";



GRANT ALL ON TABLE "public"."playbook_procedures" TO "anon";
GRANT ALL ON TABLE "public"."playbook_procedures" TO "authenticated";
GRANT ALL ON TABLE "public"."playbook_procedures" TO "service_role";



GRANT ALL ON TABLE "public"."playbook_versions" TO "anon";
GRANT ALL ON TABLE "public"."playbook_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."playbook_versions" TO "service_role";



GRANT ALL ON TABLE "public"."playbooks" TO "anon";
GRANT ALL ON TABLE "public"."playbooks" TO "authenticated";
GRANT ALL ON TABLE "public"."playbooks" TO "service_role";



GRANT ALL ON TABLE "public"."pm_instance_assets" TO "anon";
GRANT ALL ON TABLE "public"."pm_instance_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."pm_instance_assets" TO "service_role";



GRANT ALL ON TABLE "public"."pm_instances" TO "anon";
GRANT ALL ON TABLE "public"."pm_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."pm_instances" TO "service_role";



GRANT ALL ON TABLE "public"."pm_templates" TO "anon";
GRANT ALL ON TABLE "public"."pm_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."pm_templates" TO "service_role";



GRANT ALL ON TABLE "public"."priorities" TO "anon";
GRANT ALL ON TABLE "public"."priorities" TO "authenticated";
GRANT ALL ON TABLE "public"."priorities" TO "service_role";



GRANT ALL ON TABLE "public"."procedure_runs" TO "anon";
GRANT ALL ON TABLE "public"."procedure_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."procedure_runs" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."reel_notes_action_items" TO "anon";
GRANT ALL ON TABLE "public"."reel_notes_action_items" TO "authenticated";
GRANT ALL ON TABLE "public"."reel_notes_action_items" TO "service_role";



GRANT ALL ON TABLE "public"."reel_notes_recordings" TO "anon";
GRANT ALL ON TABLE "public"."reel_notes_recordings" TO "authenticated";
GRANT ALL ON TABLE "public"."reel_notes_recordings" TO "service_role";



GRANT ALL ON TABLE "public"."request_votes" TO "anon";
GRANT ALL ON TABLE "public"."request_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."request_votes" TO "service_role";



GRANT ALL ON TABLE "public"."slack_archive_channel_members" TO "anon";
GRANT ALL ON TABLE "public"."slack_archive_channel_members" TO "authenticated";
GRANT ALL ON TABLE "public"."slack_archive_channel_members" TO "service_role";



GRANT ALL ON TABLE "public"."slack_archive_channels" TO "anon";
GRANT ALL ON TABLE "public"."slack_archive_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."slack_archive_channels" TO "service_role";



GRANT ALL ON TABLE "public"."slack_archive_messages" TO "anon";
GRANT ALL ON TABLE "public"."slack_archive_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."slack_archive_messages" TO "service_role";



GRANT ALL ON TABLE "public"."slack_archive_sync_state" TO "anon";
GRANT ALL ON TABLE "public"."slack_archive_sync_state" TO "authenticated";
GRANT ALL ON TABLE "public"."slack_archive_sync_state" TO "service_role";



GRANT ALL ON TABLE "public"."supplies" TO "anon";
GRANT ALL ON TABLE "public"."supplies" TO "authenticated";
GRANT ALL ON TABLE "public"."supplies" TO "service_role";



GRANT ALL ON TABLE "public"."supply_usage" TO "anon";
GRANT ALL ON TABLE "public"."supply_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_usage" TO "service_role";



GRANT ALL ON TABLE "public"."task_categories" TO "anon";
GRANT ALL ON TABLE "public"."task_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."task_categories" TO "service_role";



GRANT ALL ON TABLE "public"."task_review_log" TO "anon";
GRANT ALL ON TABLE "public"."task_review_log" TO "authenticated";
GRANT ALL ON TABLE "public"."task_review_log" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_comments" TO "anon";
GRANT ALL ON TABLE "public"."ticket_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_comments" TO "service_role";



GRANT ALL ON TABLE "public"."volunteer_teams" TO "anon";
GRANT ALL ON TABLE "public"."volunteer_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."volunteer_teams" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































