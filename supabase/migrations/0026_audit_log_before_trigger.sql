-- 0026_audit_log_before_trigger.sql
--
-- Switches the members audit trigger from AFTER to BEFORE.
--
-- Why: the AFTER trigger fires after Postgres has already deleted the
-- members row. The trigger then tries to insert a member_audit_log row with
-- member_id pointing at the now-vanished member, which the FK constraint
-- rejects. Hard-deleting any member (e.g. via the bulk cleanup before a
-- re-import) raised "violates foreign key constraint
-- member_audit_log_member_id_fkey".
--
-- BEFORE triggers fire while the row is still present. For INSERT, NEW.id
-- is already populated (the default gen_random_uuid() runs before BEFORE
-- triggers). For UPDATE, the column-restriction trigger from 0021 fires
-- AFTER this one alphabetically (members_audit_before < members_enforce…),
-- so if 0021 raises, the whole transaction including the audit insert
-- rolls back — no stray audit rows for rejected updates.
--
-- Depends on 0025 (members_write_audit_log function, members_audit_after
-- trigger).

begin;

drop trigger if exists members_audit_after on public.members;
drop trigger if exists members_audit_before on public.members;

create trigger members_audit_before
  before insert or update or delete on public.members
  for each row
  execute function public.members_write_audit_log();

commit;
