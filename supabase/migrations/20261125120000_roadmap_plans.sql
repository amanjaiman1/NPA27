-- Roadmap plans: safe saves from older devices, and the notification dispatcher
--
-- The Roadmap keeps each person's yearly, monthly and weekly plans inside the
-- same per-account snapshot as everything else (`chronicle_state.data ->
-- 'plans'`), so it needs no new table and no new policy: the existing row
-- level security already limits every plan to its owner.
--
-- 1. A device still running a version from before the Roadmap (an installed
--    app left open, say) doesn't know the `plans` key, so the snapshot it
--    saves leaves it out. Saved as-is, that would erase the plans made on a
--    newer device. Now a save with no `plans` key keeps the plans already
--    stored. A save that includes the key, even as an empty list, is taken as
--    written, so deleting plans on a current version still works.
--
-- 2. No notification rule reads plans, so the dispatcher's reader leaves them
--    out. Without this, the scheduled job (every 15 minutes) would download
--    every subscriber's plans each run, which is egress the free plan doesn't
--    need to spend.
--
-- Everything else is exactly as the earlier migrations defined it. Safe to
-- run more than once.

-- 1. The only write path a browser has, as in the multi-user migration, with
--    the one change above.
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
       set data = case
                    when p_data ? 'plans' or not (s.data ? 'plans') then p_data
                    else p_data || jsonb_build_object('plans', s.data -> 'plans')
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

-- 2. The dispatcher's reader, as the attachments migration defined it, without plans.
create or replace function public.chronicle_dispatch_snapshots(p_user_ids uuid[])
returns table (user_id uuid, data jsonb)
language sql
stable
set search_path = ''
as $$
  select s.user_id,
         (s.data - 'files' - 'plans') || jsonb_build_object(
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
