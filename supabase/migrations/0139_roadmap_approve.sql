-- 0139_roadmap_approve.sql
--
-- Super-admins can Approve a Proposed roadmap item. That moves it to Planned
-- and records who approved it (approved_by = members.id) and when
-- (approved_at). 0138 is left for the concurrent Release Notes work on main.
--
-- Writes stay super-admin only: the update policy is recreated here so Approve
-- cannot slip through a later loosening of insert/select. Helper calls are
-- wrapped in (select …) per AGENTS.md.
--
-- Apply via the Supabase SQL editor, after 0137. Idempotent.

begin;

alter table public.olb_roadmap_items
  add column if not exists approved_by uuid references public.members(id) on delete set null;

alter table public.olb_roadmap_items
  add column if not exists approved_at timestamptz;

alter table public.olb_roadmap_items
  drop constraint if exists olb_roadmap_items_approved_check;
alter table public.olb_roadmap_items
  add constraint olb_roadmap_items_approved_check
    check ((approved_by is null) = (approved_at is null));

comment on column public.olb_roadmap_items.approved_by is
  'Member who approved a Proposed item onto Planned. Super-admins only.';
comment on column public.olb_roadmap_items.approved_at is
  'When a Proposed item was approved onto Planned. Super-admins only.';

create index if not exists olb_roadmap_items_approved_idx
  on public.olb_roadmap_items (approved_at desc) where deleted_at is null and approved_at is not null;

-- Same as 0129: only a super-admin may update, including Approve
-- (status → planned, approved_by, approved_at).
drop policy if exists "olb_roadmap_items_update" on public.olb_roadmap_items;
create policy "olb_roadmap_items_update" on public.olb_roadmap_items
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

commit;

notify pgrst, 'reload schema';
