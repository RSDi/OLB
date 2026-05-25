-- 0031_playbook_attachments.sql
--
-- Storage bucket for playbook images and video files. Marked public so the
-- URLs embedded in body_md (![](url) for images, [▶ Title](url) for videos)
-- can be loaded by <img>/<video> tags without signed-URL plumbing.
--
-- The "public" flag means anyone who has a URL can fetch the object. For
-- operational church docs that's fine — these aren't secrets. The write
-- policies still gate uploads to staff and deletes to super-admin.
--
-- Files live flat in the bucket keyed by <random-uuid>.<ext>. No
-- per-playbook folders for v1; orphaned files after a hard-delete are
-- accepted as a known trade-off.
--
-- Depends on 0001 (is_staff, is_super_admin).

begin;

-- 1. Create the bucket. Idempotent on id.
insert into storage.buckets (id, name, public)
values ('playbook-attachments', 'playbook-attachments', true)
on conflict (id) do update set public = excluded.public;

-- 2. Policies on storage.objects, scoped to this bucket.
--    Supabase ships a few default policies on storage.objects; we add ours
--    alongside (each policy has a unique name).

drop policy if exists "playbook_attachments_read" on storage.objects;
create policy "playbook_attachments_read"
  on storage.objects
  for select
  using (bucket_id = 'playbook-attachments');

drop policy if exists "playbook_attachments_insert_staff" on storage.objects;
create policy "playbook_attachments_insert_staff"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'playbook-attachments'
    and public.is_staff()
  );

drop policy if exists "playbook_attachments_update_staff" on storage.objects;
create policy "playbook_attachments_update_staff"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'playbook-attachments'
    and public.is_staff()
  )
  with check (
    bucket_id = 'playbook-attachments'
    and public.is_staff()
  );

drop policy if exists "playbook_attachments_delete_super" on storage.objects;
create policy "playbook_attachments_delete_super"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'playbook-attachments'
    and public.is_super_admin()
  );

commit;
