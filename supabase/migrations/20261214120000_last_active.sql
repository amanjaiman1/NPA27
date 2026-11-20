-- Last active
--
-- Admin → Users shows when each account last used the app, to about five
-- minutes. Only that time is kept, one row per account: never what the person
-- did. The app reports it on opening and on use, at most every five minutes,
-- through platform_mark_active(), which can mark only the signed-in account;
-- the database also ignores a report within five minutes of the last one.
-- No browser can read the table: the Admin Center reads it through
-- platform_admin_last_active(), which needs users.read like the rest of Users.
-- Deleting an account deletes its row. No live updates: a message from every
-- open app every few minutes would be noise. Safe to run more than once.

create table if not exists public.platform_last_active (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  active_at timestamptz not null default now()
);

alter table public.platform_last_active enable row level security;
revoke all on public.platform_last_active from public, anon, authenticated;

-- The account and the time both come from the database: a caller can't mark
-- anyone else or choose the time.
create or replace function public.platform_mark_active()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_last_active as l (user_id, active_at)
  select auth.uid(), now()
  where auth.uid() is not null
  on conflict (user_id) do update set active_at = excluded.active_at
  where l.active_at < excluded.active_at - interval '5 minutes';
$$;

-- { "<account id>": "<time>" } for the given accounts; those with no time are left out.
create or replace function public.platform_admin_last_active(p_actor uuid, p_users uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.platform_assert(p_actor, 'users.read');
  return coalesce((select jsonb_object_agg(l.user_id::text, l.active_at)
    from public.platform_last_active l where l.user_id = any (p_users)), '{}'::jsonb);
end
$$;

revoke all on function public.platform_mark_active() from public, anon;
grant execute on function public.platform_mark_active() to authenticated;
revoke all on function public.platform_admin_last_active(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.platform_admin_last_active(uuid, uuid[]) to service_role;
