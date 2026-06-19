-- 0074_manual_request_approval.sql
--
-- Committee review becomes a MANUAL decision instead of auto-deciding on a vote
-- majority. Any one building-committee member can approve or decline a request
-- and writes a note that's emailed to the requester. The yes/no votes stay, but
-- only as advisory input — they no longer flip the request automatically.
--
-- Changes:
--   1. New column maintenance_requests.decision_note — the editable message the
--      committee sends the requester on approve OR decline.
--   2. cast_request_vote: keep recording an advisory vote + returning the tally,
--      but REMOVE the threshold-based auto-decide.
--   3. New decide_request(ticket, decision, note): the manual approve/decline,
--      is_staff-gated, guarded to pending_review.
--   4. log_task_review trigger logs decision_note (falling back to the legacy
--      decline_reason), so the audit trail captures the note.
--
-- The status change still flows through the append-only task_review_log trigger
-- (0048), so every manual decision is audited with who + when + the note.
--
-- Depends on 0046 (review_status), 0048 (audit trigger), 0050 (votes RPC).
-- Apply via the Supabase SQL editor. Idempotent.

begin;

-- 1. The editable decision note (approve + decline).
alter table public.maintenance_requests
  add column if not exists decision_note text;

-- 2. Advisory vote: record/​change the vote and return the running tally. No
--    longer decides anything — a deciding majority used to flip the request
--    here; that branch is gone.
create or replace function public.cast_request_vote(
  p_ticket_id uuid,
  p_vote      text,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- 3. Manual decision: any committee member approves/declines with a note.
create or replace function public.decide_request(
  p_ticket_id uuid,
  p_decision  text,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

grant execute on function public.decide_request(uuid, text, text) to authenticated;

-- 4. Audit trail: log the decision note (fall back to the legacy decline_reason).
create or replace function public.log_task_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.review_status is distinct from old.review_status then
    insert into public.task_review_log (ticket_id, changed_by, old_status, new_status, reason)
    values (new.id, auth.uid(), old.review_status, new.review_status,
            coalesce(new.decision_note, new.decline_reason));
  end if;
  return new;
end;
$$;

commit;
