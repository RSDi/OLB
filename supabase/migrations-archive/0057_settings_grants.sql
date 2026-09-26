-- 0057: settings permission grants.
--
-- Standing capabilities a super-admin gives a Building Committee member
-- (role = 'admin'): edit settings, soft-delete items, restore items. A member
-- with no grant can VIEW settings but not change them. Super-admins implicitly
-- hold every grant; permanent purge + issuing grants stay super-admin only.
--
-- Enforcement is primarily the app layer (the settings server actions call
-- grant-aware guards, and the UI gates buttons by the same predicates). These
-- SECURITY DEFINER helpers mirror is_staff()/is_super_admin() so RLS write
-- policies can be tightened to them in a follow-up. Idempotent.

alter table public.members add column if not exists can_edit_settings     boolean not null default false;
alter table public.members add column if not exists can_delete_settings   boolean not null default false;
alter table public.members add column if not exists can_undelete_settings boolean not null default false;

create or replace function public.can_edit_settings()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select m.role = 'super_admin'
        or (m.status = 'approved' and m.role = 'admin' and m.can_edit_settings)
      from public.members m where m.user_id = auth.uid()
  ), false)
$$;

create or replace function public.can_delete_settings()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select m.role = 'super_admin'
        or (m.status = 'approved' and m.role = 'admin' and m.can_delete_settings)
      from public.members m where m.user_id = auth.uid()
  ), false)
$$;

create or replace function public.can_undelete_settings()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select m.role = 'super_admin'
        or (m.status = 'approved' and m.role = 'admin' and m.can_undelete_settings)
      from public.members m where m.user_id = auth.uid()
  ), false)
$$;

-- Coarse "can this user write to settings at all" — super-admin or an admin
-- holding any grant. Intended as the RLS write backstop (follow-up).
create or replace function public.can_manage_settings()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select m.role = 'super_admin'
        or (m.status = 'approved' and m.role = 'admin'
            and (m.can_edit_settings or m.can_delete_settings or m.can_undelete_settings))
      from public.members m where m.user_id = auth.uid()
  ), false)
$$;

grant execute on function public.can_edit_settings()     to authenticated;
grant execute on function public.can_delete_settings()   to authenticated;
grant execute on function public.can_undelete_settings() to authenticated;
grant execute on function public.can_manage_settings()   to authenticated;
