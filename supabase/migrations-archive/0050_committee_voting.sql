-- 0050_committee_voting.sql
--
-- A1 (committee voting) + A4 (approved request → calendar event) + D1 (any
-- committee admin can approve members).
--
-- 1. request_votes: one row per committee member per request. The decision
--    rule (locked in the 2026-06-11 interview): simple majority of the
--    current committee, instant — the moment yes-votes reach majority the
--    request is approved; same for no-votes declining it. A "no" requires a
--    note; collected no-notes become the decline reason. Majority is computed
--    live as floor(staff/2)+1 over approved, non-deleted admins/super_admins
--    with portal accounts (7 committee members → 4).
--
-- 2. cast_request_vote(): SECURITY DEFINER so voting + the decision flip are
--    one atomic statement series under a row lock (two simultaneous deciding
--    votes can't both fire). All vote writes go through it — request_votes
--    has no INSERT/UPDATE policies on purpose. The review_status UPDATE here
--    fires the 0048 task_review_log trigger, so the audit trail keeps working
--    unchanged.
--
-- 3. Member approval widened from super_admin to staff (D1): new staff UPDATE
--    policy on members + the 0032 column-guard trigger relaxed so staff may
--    change status / reviewed_by / reviewed_at. Role, email, deletion, and
--    the pastoral directory fields stay super-admin-only.
--
-- Idempotent; safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Votes table
-- ---------------------------------------------------------------------------

create table if not exists public.request_votes (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.maintenance_requests(id) on delete cascade,
  voter_id   uuid not null references auth.users(id) on delete cascade,
  vote       text not null check (vote in ('yes', 'no')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticket_id, voter_id)
);

create index if not exists request_votes_ticket_idx on public.request_votes (ticket_id);

alter table public.request_votes enable row level security;

-- Staff read the tally; nobody writes directly (the RPC below is the only
-- write path and runs as definer).
drop policy if exists "request_votes_select_staff" on public.request_votes;
create policy "request_votes_select_staff" on public.request_votes
  for select to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- 2. Voting RPC
-- ---------------------------------------------------------------------------

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
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_status    text;
  v_staff     int;
  v_threshold int;
  v_yes       int;
  v_no        int;
  v_reason    text;
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

  -- Lock the ticket row so concurrent deciding votes serialize.
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

  -- Cast or change my vote (changeable until the decision lands).
  insert into public.request_votes (ticket_id, voter_id, vote, note)
  values (p_ticket_id, auth.uid(), p_vote, v_note)
  on conflict (ticket_id, voter_id)
  do update set vote = excluded.vote, note = excluded.note, updated_at = now();

  -- Majority of the committee as it stands right now.
  select count(*) into v_staff
    from public.members
   where role in ('admin', 'super_admin')
     and status = 'approved'
     and deleted_at is null
     and user_id is not null;
  v_threshold := greatest(1, v_staff / 2 + 1);

  -- Count only votes from people who are still on the committee.
  select count(*) filter (where v.vote = 'yes'),
         count(*) filter (where v.vote = 'no')
    into v_yes, v_no
    from public.request_votes v
    join public.members m on m.user_id = v.voter_id
   where v.ticket_id = p_ticket_id
     and m.role in ('admin', 'super_admin')
     and m.status = 'approved'
     and m.deleted_at is null;

  if v_yes >= v_threshold then
    update public.maintenance_requests
       set review_status = 'approved',
           reviewed_by   = auth.uid(),
           reviewed_at   = now()
     where id = p_ticket_id;
    return jsonb_build_object('decided', 'approved', 'yes', v_yes, 'no', v_no, 'threshold', v_threshold);
  end if;

  if v_no >= v_threshold then
    select string_agg(coalesce(m.full_name, 'Committee member') || ': ' || v.note, e'\n')
      into v_reason
      from public.request_votes v
      join public.members m on m.user_id = v.voter_id
     where v.ticket_id = p_ticket_id and v.vote = 'no' and v.note is not null;

    update public.maintenance_requests
       set review_status   = 'declined',
           decline_reason  = coalesce(v_reason, 'Declined by committee vote'),
           reviewed_by     = auth.uid(),
           reviewed_at     = now()
     where id = p_ticket_id;
    return jsonb_build_object('decided', 'declined', 'yes', v_yes, 'no', v_no, 'threshold', v_threshold);
  end if;

  return jsonb_build_object('decided', null, 'yes', v_yes, 'no', v_no, 'threshold', v_threshold);
end
$$;

revoke all on function public.cast_request_vote(uuid, text, text) from public;
grant execute on function public.cast_request_vote(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A4 — approved building use lands on the calendar
-- ---------------------------------------------------------------------------

-- Link an auto-created event back to the request it came from.
alter table public.events
  add column if not exists source_ticket_id uuid references public.maintenance_requests(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. D1 — committee admins approve members
-- ---------------------------------------------------------------------------

drop policy if exists "members_staff_update" on public.members;
create policy "members_staff_update" on public.members
  for update to authenticated
  using (public.is_staff() and deleted_at is null)
  with check (public.is_staff());

-- Column guard (latest version was 0032): staff may now change membership
-- status + review stamps; identity, role, deletion, and pastoral directory
-- fields remain super-admin-only.
create or replace function public.members_enforce_self_update_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

commit;
