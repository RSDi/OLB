-- 0046_request_review.sql
-- Adds a committee review stage to tasks (maintenance_requests) so member
-- requests can be reviewed -> approved / declined-with-reason before they enter
-- the work queue.
--
-- Committee == staff (public.is_staff()), so NO new role or RLS is required:
-- existing maintenance_requests policies already let staff see/update every row
-- and let members see their own (a member sees their request's review_status and
-- decline_reason on their own row). Visibility of "needs review" vs "approved" is
-- a query-level filter in the app, not RLS.
--
-- Additive only. Depends on 0005 (maintenance_requests), 0045 (projects/project_id).

begin;

-- Review lifecycle, reviewer attribution, decline reason, and the structured
-- wizard answers. review_status defaults to 'approved' so every existing row
-- (already triaged work) stays in the queue; the new intake wizard explicitly
-- inserts 'pending_review'.
alter table public.maintenance_requests
  add column if not exists review_status text not null default 'approved'
    check (review_status in ('pending_review', 'approved', 'declined')),
  add column if not exists decline_reason text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists details jsonb;

-- Queue/list lookups filter by review_status among live rows.
create index if not exists maintenance_requests_review_status_idx
  on public.maintenance_requests (review_status)
  where deleted_at is null;

commit;
