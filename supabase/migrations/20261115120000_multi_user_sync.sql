-- ════════════════════════════════════════════════════════════════
-- Multi-user accounts: versioned saves and tighter write paths
--
-- Run after `supabase/schema.sql`, in the Supabase SQL Editor. Additive and
-- safe to re-run: nothing is dropped, no rows are rewritten, and every
-- existing snapshot keeps its data (it starts at version 1).
--
-- What it changes
--   1. `chronicle_state.version` — a counter the server bumps on every write.
--      A device saves with the version it last saw; if another device wrote in
--      between, the save is refused and the app merges instead of overwriting.
--   2. `updated_at` is stamped by the database, never by a device clock.
--   3. Browsers can no longer INSERT/UPDATE/DELETE `chronicle_state` directly.
--      Every write goes through `save_chronicle_state`, which only ever touches
--      the caller's own row. Reads are still filtered by the existing RLS
--      policies, which are left in place.
--   4. `chronicle_dispatch_snapshots` gives the push dispatcher a trimmed copy
--      of each snapshot (no long text, no photos), callable by the service role
--      only. It cuts the dispatcher's egress to a fraction.
-- ════════════════════════════════════════════════════════════════

-- 1. The version counter. Existing rows become version 1.
alter table public.chronicle_state
  add column if not exists version bigint not null default 1;

-- Refuse absurd payloads. Text-only data is a few hundred KB a year, so 8 MB is
-- generous; `not valid` leaves any existing row alone and checks new writes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chronicle_state_data_size'
  ) then
    alter table public.chronicle_state
      add constraint chronicle_state_data_size
      check (octet_length(data::text) <= 8388608) not valid;
  end if;
end $$;

-- 2. Server-side stamping: every write bumps the version and the timestamp, and
--    a row can never change owner.
create or replace function public.chronicle_state_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chronicle_state_stamp on public.chronicle_state;
create trigger chronicle_state_stamp
  before insert or update on public.chronicle_state
  for each row execute function public.chronicle_state_stamp();

-- 3. The only write path a browser has.
--
-- `p_base_version` is the version the device last synced. 0 means "I have never
-- saved", which inserts the row. Returns `saved = false` with the row's current
-- version when someone else got there first; the app then pulls, merges and
-- retries. `security definer` so that direct table writes can be revoked from
-- browser roles; it acts only on `auth.uid()`'s row, never on a caller-supplied id.
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

-- Browser roles read their own row (RLS) and write through the function only.
revoke insert, update, delete on table public.chronicle_state from anon, authenticated;
revoke all on table public.chronicle_state from anon;
grant select on table public.chronicle_state to authenticated;

-- Nothing in the app reads these anonymously.
revoke all on table public.chronicle_push_subscriptions from anon;
revoke all on table public.chronicle_push_log from anon;

revoke all on function public.save_chronicle_state(jsonb, bigint) from public, anon;
grant execute on function public.save_chronicle_state(jsonb, bigint) to authenticated;

revoke all on function public.chronicle_state_stamp() from public, anon, authenticated;

-- 4. A trimmed snapshot for the push dispatcher.
--
-- The notification rules need dates, hours, statuses and schedules, not the
-- words. Stripping long text before it leaves the database is most of what the
-- dispatcher used to download every run.
create or replace function public.chronicle_strip_keys(items jsonb, keys text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(items) = 'array' then coalesce(
      (
        select jsonb_agg(
                 case when jsonb_typeof(e.value) = 'object' then e.value - keys else e.value end
                 order by e.ordinality
               )
          from jsonb_array_elements(items) with ordinality as e(value, ordinality)
      ),
      '[]'::jsonb
    )
    else '[]'::jsonb
  end;
$$;

create or replace function public.chronicle_dispatch_snapshots(p_user_ids uuid[])
returns table (user_id uuid, data jsonb)
language sql
stable
set search_path = ''
as $$
  select s.user_id,
         s.data || jsonb_build_object(
           'journal', public.chronicle_strip_keys(
             s.data -> 'journal',
             array['attachments', 'reflection', 'highlights', 'wins', 'failures', 'lessons', 'tags']
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
           )
         )
    from public.chronicle_state s
   where s.user_id = any (p_user_ids);
$$;

revoke all on function public.chronicle_strip_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.chronicle_dispatch_snapshots(uuid[]) from public, anon, authenticated;
grant execute on function public.chronicle_strip_keys(jsonb, text[]) to service_role;
grant execute on function public.chronicle_dispatch_snapshots(uuid[]) to service_role;
