-- 0027_audit_log_drop_fk.sql
--
-- Drops the FK on member_audit_log.member_id and restores the trigger to a
-- single AFTER-mode invocation.
--
-- Why: 0025 had the FK with ON DELETE SET NULL plus an AFTER trigger. That
-- broke on delete because the AFTER trigger runs after the row is gone, so
-- inserting an audit row that FK-referenced the just-deleted member failed.
-- 0026 switched to BEFORE, which then broke INSERT — at BEFORE INSERT time
-- the new members row doesn't exist yet, so the audit row's FK reference
-- to NEW.id was unresolvable.
--
-- The simplest fix is to drop the FK entirely. member_id is still stored
-- as a uuid; the only writer is the trigger (which always uses real
-- NEW.id / OLD.id values). Without the FK we no longer need ON DELETE SET
-- NULL — deleted-member audit rows keep their original member_id pointer
-- AND their full old_data JSONB, which is actually better for forensics
-- ("what was member X's state when they were deleted").
--
-- Depends on 0025, 0026.

begin;

alter table public.member_audit_log
  drop constraint if exists member_audit_log_member_id_fkey;

-- Restore a single AFTER trigger covering all three actions. Now safe
-- because there's no FK to violate.
drop trigger if exists members_audit_before on public.members;
drop trigger if exists members_audit_after on public.members;

create trigger members_audit_after
  after insert or update or delete on public.members
  for each row
  execute function public.members_write_audit_log();

commit;
