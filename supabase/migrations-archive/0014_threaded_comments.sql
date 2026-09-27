-- 0014_threaded_comments.sql
--
-- Threaded replies on ticket_comments. parent_id is nullable — existing rows
-- remain top-level. New replies set parent_id to the comment they're under.
--
-- ON DELETE CASCADE: if a parent comment is hard-deleted (super-admin only,
-- per existing RLS), the replies go too — keeps the tree consistent.
-- Soft-delete leaves the chain intact; the UI hides the body of deleted
-- nodes but keeps their replies visible.
--
-- Depends on 0006 (ticket_comments).

begin;

alter table public.ticket_comments
  add column if not exists parent_id uuid
    references public.ticket_comments(id) on delete cascade;

create index if not exists ticket_comments_parent_idx
  on public.ticket_comments (parent_id)
  where parent_id is not null and deleted_at is null;

commit;
