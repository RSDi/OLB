-- 0096_rename_building_committee_to_board.sql
--
-- The Building Committee is now called the Board. Rewords the errors these
-- functions raise, which can reach the UI; nothing else changes. Bodies are
-- verbatim from their last versions (cast_request_vote and decide_request
-- from 0000, members_enforce_self_update_columns from 0088).
--
-- Apply via the Supabase SQL editor, after 0095. Idempotent.

begin;

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
    raise exception 'Only board members can vote';
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

  -- Tally from people who are still on the board (advisory display only).
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

CREATE OR REPLACE FUNCTION "public"."decide_request"("p_ticket_id" "uuid", "p_decision" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_note   text := nullif(trim(coalesce(p_note, '')), '');
  v_status text;
begin
  if not public.is_staff() then
    raise exception 'Only board members can decide a request';
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

create or replace function public.members_enforce_self_update_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted backend (service key) and super-admins may change anything.
  if coalesce(current_setting('role', true), '') = 'service_role' then
    return new;
  end if;
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
    raise exception 'Only the board can change member status';
  end if;

  return new;
end
$$;

commit;
