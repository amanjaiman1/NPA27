-- Presence: when each account opened DoOrDie, and when it left
--
-- Admin → Users shows every account's latest visit: when it opened the app,
-- the moment it left, and whether it's on the site right now. Only times are
-- kept, in the one row per account of platform_last_active
-- (20261214120000_last_active.sql): never what the person did, where, or on
-- which device.
--
-- The app reports through platform_mark_presence(), for one browser tab:
--   'here'  the tab is on screen: it opened, it was come back to, or it is
--           still open (once a minute while it stays on screen);
--   'left'  it went off screen: the tab was closed or hidden, the phone
--           locked, another app opened. Sent as the page goes, so it arrives
--           even while the tab is closing.
-- The account is on the site while any of its tabs is, on any device: one
-- tab leaving while another is on screen ends nothing. A visit starts with
-- the first 'here' after more than five minutes away; coming back sooner
-- carries on the same visit. When a 'left' never arrives (the browser was
-- killed, the connection dropped), the tab counts as gone 150 seconds after
-- its last report, two and a half of the app's once-a-minute reports, and
-- the visit ends at that report.
--
-- The Admin Center reads it through platform_admin_presence(), which needs
-- users.read like the rest of Users. A visit starting, ending or resuming
-- tells open Admin Center screens at once (live update area "activity").
-- The once-a-minute "still here" doesn't: it changes nothing anyone sees.
--
-- platform_mark_active(), the previous release's report, now counts as
-- 'here', so an app still running the earlier code keeps being seen.
--
-- Needs 20261213120000_live_everywhere.sql and 20261214120000_last_active.sql
-- first. Safe to run more than once.

-- 1. The visit's start and end, beside the last moment seen ──────────
alter table public.platform_last_active
  add column if not exists opened_at timestamptz,
  add column if not exists left_at timestamptz,
  add column if not exists tabs jsonb not null default '{}'::jsonb;

comment on column public.platform_last_active.active_at is 'The last moment the app was known to be on screen.';
comment on column public.platform_last_active.opened_at is 'When the latest visit began. Null for a row kept before visits were.';
comment on column public.platform_last_active.left_at is 'When the latest visit ended. Null while it may still be under way.';
comment on column public.platform_last_active.tabs is
  'The account''s browser tabs heard from in the last ten minutes, at most 20: a random id per tab (nothing about the '
  'device) -> { seq: its report count, at: epoch second of its last report, on: on screen }.';

-- 2. What the app reports ────────────────────────────────────────────
-- The account and the time both come from the database: a caller can't
-- report for anyone else, or choose the time. `p_tab` is the tab's own
-- random id, `p_seq` counts its reports: one that arrives after a later one
-- from the same tab (a "left" overtaken by "here" on a slow network) is
-- ignored. Reports without a tab, the previous release's, share one.
create or replace function public.platform_mark_presence(p_state text default 'here', p_tab text default null, p_seq bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t timestamptz := now();
  sec numeric := extract(epoch from now());
  tab text := coalesce(p_tab, 'app');
  r public.platform_last_active%rowtype;
  mine jsonb;
  kept jsonb;
  others_on boolean;
begin
  if me is null or p_state is null or p_state not in ('here', 'left') or tab !~ '^[A-Za-z0-9_-]{1,64}$' then
    return;
  end if;
  select * into r from public.platform_last_active where user_id = me for update;

  if not found then
    -- Nothing has begun, so there's nothing to end.
    if p_state = 'here' then
      insert into public.platform_last_active (user_id, opened_at, active_at, left_at, tabs)
      values (me, t, t, null, jsonb_build_object(tab, jsonb_build_object('seq', p_seq, 'at', sec, 'on', true)))
      on conflict (user_id) do nothing;
    end if;
    return;
  end if;

  mine := r.tabs -> tab;
  if p_seq is not null and jsonb_typeof(mine -> 'seq') = 'number' and (mine ->> 'seq')::bigint >= p_seq then
    return;
  end if;

  -- The account's other tabs: kept for ten minutes (the latest 19), and on
  -- screen if they said so within the last 150 seconds.
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb),
         coalesce(bool_or((v ->> 'on')::boolean and (v ->> 'at')::numeric > sec - 150), false)
    into kept, others_on
    from (select key as k, value as v
            from jsonb_each(r.tabs)
           where key <> tab and jsonb_typeof(value) = 'object' and jsonb_typeof(value -> 'at') = 'number'
             and (value ->> 'at')::numeric > sec - 600
           order by (value ->> 'at')::numeric desc
           limit 19) recent;
  kept := kept || jsonb_build_object(tab, jsonb_build_object('seq', p_seq, 'at', sec, 'on', p_state = 'here'));

  if p_state = 'left' then
    -- The visit ends only when no other tab or device is on screen; once
    -- ended, another 'left' changes nothing but the tab's own record.
    update public.platform_last_active
       set active_at = case when r.left_at is not null and not others_on then r.active_at else t end,
           left_at = case when others_on then r.left_at else coalesce(r.left_at, t) end,
           tabs = kept
     where user_id = me;
    return;
  end if;

  update public.platform_last_active
     set opened_at = case
           -- Away (nothing on screen) for more than five minutes: a new visit.
           when r.opened_at is null or (not others_on and r.active_at < t - interval '5 minutes') then t
           else r.opened_at
         end,
         active_at = t,
         left_at = null,
         tabs = kept
   where user_id = me;
end
$$;

create or replace function public.platform_mark_active()
returns void
language sql
security definer
set search_path = ''
as $$
  select public.platform_mark_presence('here', null, null);
$$;

-- 3. What the Admin Center reads ─────────────────────────────────────
-- For the accounts on one page of Users: { "<account id>": { openedAt,
-- seenAt, leftAt, online, onlineUntil, checkedAt } }. leftAt is when the
-- latest visit ended, worked out for a visit whose 'left' never came;
-- onlineUntil is when "on the site" runs out unless the app reports again,
-- and checkedAt the database's own time, so an open screen knows when to
-- look again whatever its clock says. Accounts never seen are left out.
-- The tabs themselves are never shown.
create or replace function public.platform_admin_presence(p_actor uuid, p_users uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.platform_assert(p_actor, 'users.read');
  return coalesce((
    select jsonb_object_agg(v.user_id::text, jsonb_build_object(
             'openedAt', v.opened_at,
             'seenAt', v.active_at,
             'leftAt', case when v.online then null else coalesce(v.left_at, v.active_at) end,
             'online', v.online,
             'onlineUntil', case when v.online then v.active_at + interval '150 seconds' end,
             'checkedAt', now()))
      from (select l.*, l.left_at is null and l.active_at > now() - interval '150 seconds' as online
              from public.platform_last_active l
             where l.user_id = any (p_users)) v
  ), '{}'::jsonb);
end
$$;

revoke all on function public.platform_mark_presence(text, text, bigint) from public, anon;
grant execute on function public.platform_mark_presence(text, text, bigint) to authenticated;
revoke all on function public.platform_mark_active() from public, anon;
grant execute on function public.platform_mark_active() to authenticated;
revoke all on function public.platform_admin_presence(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.platform_admin_presence(uuid, uuid[]) to service_role;

-- 4. Live updates ────────────────────────────────────────────────────
-- A visit beginning, ending or resuming. Not the once-a-minute report.
drop trigger if exists platform_live_presence on public.platform_last_active;
create trigger platform_live_presence after insert on public.platform_last_active
  for each row execute function public.platform_live_notify('platform-admin-updates', 'activity');
drop trigger if exists platform_live_presence_changed on public.platform_last_active;
create trigger platform_live_presence_changed after update on public.platform_last_active
  for each row when (old.opened_at is distinct from new.opened_at or old.left_at is distinct from new.left_at)
  execute function public.platform_live_notify('platform-admin-updates', 'activity');
