-- Personal Diary, Performance Review and Study Coach: privacy and safe saves
--
-- Everything still lives in each person's own row of `chronicle_state`, so
-- there is no new table and no new policy: row level security already limits
-- every diary entry, review, habit and coach record to its owner. This
-- migration changes two functions.
--
-- 1. The Study Coach keeps a history under a new key, `coach`. A device still
--    running an earlier version doesn't know that key, so the snapshot it
--    saves leaves it out; saved as-is, that would erase the history kept on a
--    newer device. A save with no `coach` key now keeps the stored one, the
--    same guard `plans` already had (and still has). A save that includes the
--    key is taken as written.
--
-- 2. The notification dispatcher (server only, every 15 minutes) reads a
--    trimmed copy of each subscriber's snapshot. It now receives:
--      • Personal Diary entries (`reflections`) as dates only: no title, no
--        words, no tags, category, flags, mood or files. The one rule that
--        looks at the diary only asks how long it has been quiet.
--      • Performance Reviews without what you wrote (`answers`) or their
--        frozen figures (`snapshot`), as well as the older written lists.
--      • No Study Coach history at all.
--    Everything else is exactly as the roadmap migration left it.
--
-- Safe to run more than once.

-- 1. The only write path a browser has, with `coach` kept like `plans`.
create or replace function public.save_chronicle_state(
  p_data jsonb,
  p_base_version bigint
)
returns table (saved boolean, version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  new_version bigint;
  new_updated timestamptz;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'snapshot must be a JSON object' using errcode = '22023';
  end if;

  if coalesce(p_base_version, 0) <= 0 then
    insert into public.chronicle_state as s (user_id, data)
    values (caller, p_data)
    on conflict (user_id) do nothing
    returning s.version, s.updated_at into new_version, new_updated;
  else
    update public.chronicle_state as s
       set data = p_data
                  || case
                       when not (p_data ? 'plans') and (s.data ? 'plans')
                         then jsonb_build_object('plans', s.data -> 'plans')
                       else '{}'::jsonb
                     end
                  || case
                       when not (p_data ? 'coach') and (s.data ? 'coach')
                         then jsonb_build_object('coach', s.data -> 'coach')
                       else '{}'::jsonb
                     end
     where s.user_id = caller
       and s.version = p_base_version
    returning s.version, s.updated_at into new_version, new_updated;
  end if;

  if new_version is not null then
    return query select true, new_version, new_updated;
    return;
  end if;

  -- Not saved: report where the row is now (version 0 when it doesn't exist).
  return query
    select false, s.version, s.updated_at
      from public.chronicle_state s
     where s.user_id = caller;
  if not found then
    return query select false, 0::bigint, null::timestamptz;
  end if;
end;
$$;

revoke all on function public.save_chronicle_state(jsonb, bigint) from public, anon;
grant execute on function public.save_chronicle_state(jsonb, bigint) to authenticated;

-- 2. The dispatcher's reader: no diary words, no review writing, no coach.
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
           )
         )
    from public.chronicle_state s
   where s.user_id = any (p_user_ids);
$$;

revoke all on function public.chronicle_dispatch_snapshots(uuid[]) from public, anon, authenticated;
grant execute on function public.chronicle_dispatch_snapshots(uuid[]) to service_role;
