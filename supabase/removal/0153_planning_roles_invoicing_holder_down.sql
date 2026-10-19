-- Undo 0153. Board can change Held by on President / AD / Treasurer again.

begin;

drop trigger if exists planning_roles_invoicing_holder_guard on public.planning_roles;
drop function if exists public.planning_roles_invoicing_holder_guard();

commit;
