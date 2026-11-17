-- ════════════════════════════════════════════════════════════════
-- Journal attachments
--
-- Files attached to journal days are stored in Supabase Storage, in one
-- private bucket, under a folder named after the owner's user id:
--
--     chronicle-attachments/<user id>/<sha-256 of the bytes>
--
-- Only a small description of each file travels in the synced snapshot
-- (`files` in chronicle_state.data). The bytes never do.
--
-- What enforces privacy is the four policies below: a signed-in user can
-- read, add, replace and delete objects in their own folder and nowhere
-- else. The bucket is not public, so every read needs either the owner's
-- session or a short-lived signed link minted with it.
--
-- Naming objects by their content hash means the same file is never
-- stored twice for an account, however often it is attached.
--
-- Additive and safe to re-run. Run it in the SQL Editor after the earlier
-- migrations.
-- ════════════════════════════════════════════════════════════════

-- 1. The bucket. 5 MB a file, and only the types the app offers. The app
--    checks the same limits first; these make them hold for any client.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chronicle-attachments',
  'chronicle-attachments',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Owner-only access. `(select auth.uid())` is evaluated once per query
--    rather than once per row.
drop policy if exists "chronicle_attachments_select_own" on storage.objects;
create policy "chronicle_attachments_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chronicle-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- New objects must sit directly in the owner's folder and be named by a
-- SHA-256, which is what the app writes; anything else is refused.
drop policy if exists "chronicle_attachments_insert_own" on storage.objects;
create policy "chronicle_attachments_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chronicle-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$'
  );

drop policy if exists "chronicle_attachments_update_own" on storage.objects;
create policy "chronicle_attachments_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'chronicle-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'chronicle-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$'
  );

drop policy if exists "chronicle_attachments_delete_own" on storage.objects;
create policy "chronicle_attachments_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chronicle-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- 3. The push dispatcher's trimmed snapshot gains nothing it doesn't need:
--    file descriptions, goal notes and life-day notes are dropped along with
--    the long text it already left out.
create or replace function public.chronicle_dispatch_snapshots(p_user_ids uuid[])
returns table (user_id uuid, data jsonb)
language sql
stable
set search_path = ''
as $$
  select s.user_id,
         (s.data - 'files') || jsonb_build_object(
           'journal', public.chronicle_strip_keys(
             s.data -> 'journal',
             array['attachments', 'fileIds', 'reflection', 'highlights', 'wins', 'failures', 'lessons', 'tags']
           ),
           'mistakes', public.chronicle_strip_keys(
             s.data -> 'mistakes',
             array['question', 'userAnswer', 'correctAnswer', 'explanation']
           ),
           'currentAffairs', public.chronicle_strip_keys(
             s.data -> 'currentAffairs',
             array['summary', 'tags']
           ),
           'reflections', public.chronicle_strip_keys(
             s.data -> 'reflections',
             array['content', 'gratitude', 'prompt']
           ),
           'reviews', public.chronicle_strip_keys(
             s.data -> 'reviews',
             array['wins', 'struggles', 'lessons', 'nextFocus']
           ),
           'goals', public.chronicle_strip_keys(
             s.data -> 'goals',
             array['notes', 'fileIds', 'progressLog']
           ),
           'lifeLog', public.chronicle_strip_keys(
             s.data -> 'lifeLog',
             array['note', 'fileIds']
           )
         )
    from public.chronicle_state s
   where s.user_id = any (p_user_ids);
$$;

revoke all on function public.chronicle_dispatch_snapshots(uuid[]) from public, anon, authenticated;
grant execute on function public.chronicle_dispatch_snapshots(uuid[]) to service_role;
