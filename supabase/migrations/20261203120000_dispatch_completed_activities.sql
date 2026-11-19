-- Reminders for habits that count Roadmap work
--
-- A habit can count planned activities you mark completed ("five Roadmap
-- activities a week"). The reminder dispatcher (server only, every 15
-- minutes) couldn't tell whether such a habit was done, because its reader
-- leaves the Roadmap out, so those habits were never reminded about.
--
-- The reader now includes, for each plan, only its id and its completed
-- activities: each activity's id, kind, status, the time it was completed
-- and its subject. No plan titles, focus, objectives, notes or reviews, and
-- no activity titles, descriptions, notes or anything unfinished. That is
-- all the Habit Engine needs to count a habit's Roadmap work.
--
-- Everything else is exactly as the diary and coach migration
-- (20261202120000) left it: no diary words, no review writing, no coach
-- history, no habit descriptions, no file details.
--
-- No table or policy changes. Safe to run more than once. Until it runs, the
-- app works as before and leaves these habits out of background reminders.

create or replace function public.chronicle_dispatch_snapshots(p_user_ids uuid[])
returns table (user_id uuid, data jsonb)
language sql
stable
set search_path = ''
as $$
  select s.user_id,
         (s.data - 'files' - 'plans' - 'coach') || jsonb_build_object(
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
             array['content', 'gratitude', 'prompt', 'title', 'tags', 'category', 'pinned', 'important', 'mood', 'fileIds', 'createdAt', 'updatedAt']
           ),
           'reviews', public.chronicle_strip_keys(
             s.data -> 'reviews',
             array['wins', 'struggles', 'lessons', 'nextFocus', 'answers', 'snapshot']
           ),
           'goals', public.chronicle_strip_keys(
             s.data -> 'goals',
             array['notes', 'fileIds', 'progressLog']
           ),
           'lifeLog', public.chronicle_strip_keys(
             s.data -> 'lifeLog',
             array['note', 'fileIds']
           ),
           'habits', public.chronicle_strip_keys(
             s.data -> 'habits',
             array['description']
           ),
           -- Each plan's id and completed activities, nothing written.
           'plans', coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', p -> 'id',
               'items', coalesce((
                 select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'id', i -> 'id',
                   'kind', i -> 'kind',
                   'status', i -> 'status',
                   'completedAt', i -> 'completedAt',
                   'subjectId', i -> 'subjectId'
                 )))
                 from jsonb_array_elements(
                   case when jsonb_typeof(p -> 'items') = 'array' then p -> 'items' else '[]'::jsonb end
                 ) as i
                 where i ->> 'kind' = 'activity' and i ->> 'status' = 'completed'
               ), '[]'::jsonb)
             ))
             from jsonb_array_elements(
               case when jsonb_typeof(s.data -> 'plans') = 'array' then s.data -> 'plans' else '[]'::jsonb end
             ) as p
             where jsonb_typeof(p) = 'object'
           ), '[]'::jsonb)
         )
    from public.chronicle_state s
   where s.user_id = any (p_user_ids);
$$;

revoke all on function public.chronicle_dispatch_snapshots(uuid[]) from public, anon, authenticated;
grant execute on function public.chronicle_dispatch_snapshots(uuid[]) to service_role;
