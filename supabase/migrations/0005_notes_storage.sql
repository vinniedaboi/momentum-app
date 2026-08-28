-- Private bucket replacing the Cloudflare R2 `NOTES` binding.
--
-- Object paths are `<workspace_id>/<yyyy-mm-dd>/<uuid>`, so the first path
-- segment identifies the owner and the policies below can authorise on it
-- without a join. Route handlers talk to storage with the caller's own session
-- (never the service role), so these policies are the real access control.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notes',
  'notes',
  false,
  20971520, -- 20 MB, matching the upload guard in app/api/notes/route.ts
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do nothing;

create policy notes_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'notes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy notes_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'notes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy notes_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'notes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'notes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy notes_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'notes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
