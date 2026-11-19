-- Live updates from the Admin Center
--
-- When an administrator changes something students see (an announcement,
-- the notice in the app, an answer to feedback, a review's status), the
-- Admin API sends one message on the private Realtime channel
-- `platform-updates`, through Supabase's REST broadcast endpoint with the
-- service-role key. Every open app then reloads that part of its page through
-- the functions it already uses. The message carries no content and no
-- account, only which areas changed (lib/platform/live.ts).
--
-- 1. Signed-in accounts may join the channel and receive its messages.
--    Nobody may send on it except the server: there is no insert policy, and
--    the service role bypasses row-level security. Realtime already has
--    row-level security on for realtime.messages; this only adds a policy.
--
-- 2. platform_my_announcements also says when the next scheduled start or
--    end is (`nextChangeAt`), with the database's clock (`now`), so an open
--    app reloads at that moment: a scheduled announcement appears, and an
--    ending one goes, on time, without polling. Everything else it returns
--    is exactly as the platform migration (20261204120000) defined it.
--
-- No new tables. Safe to run more than once. Where Realtime isn't installed
-- (the local mock), part 1 is skipped and the apps fall back to reloading
-- when they open or come back to the screen.

-- 1. Who may listen ─────────────────────────────────────────────────────
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'Realtime is not installed in this database: live updates are skipped.';
    return;
  end if;
  execute 'drop policy if exists "platform_updates_receive" on realtime.messages';
  execute $policy$
    create policy "platform_updates_receive"
      on realtime.messages
      for select
      to authenticated
      using ((select realtime.topic()) = 'platform-updates' and realtime.messages.extension in ('broadcast'))
  $policy$;
end
$$;

-- 2. When to look again ─────────────────────────────────────────────────
create or replace function public.platform_my_announcements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  notice jsonb := public.platform_settings_current() -> 'app_notice';
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  return jsonb_build_object(
    'notice', case when coalesce((notice ->> 'enabled')::boolean, false)
                   then jsonb_build_object('message', notice ->> 'message', 'tone', notice ->> 'tone') end,
    -- Answers from the team the person hasn't opened yet, so the app can say so.
    'unseenResponses', (select count(*) from public.platform_feedback f
                         where f.user_id = uid and f.response is not null
                           and (f.response_seen_at is null or f.response_seen_at < f.response_at)),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'body', a.body, 'category', a.category,
        'startsAt', a.starts_at, 'endsAt', a.ends_at,
        'active', a.ends_at is null or a.ends_at > now(),
        'readAt', rd.read_at, 'dismissedAt', rd.dismissed_at) order by a.starts_at desc)
      from (select * from public.platform_announcements x
             where x.status = 'published' and x.starts_at <= now()
             order by x.starts_at desc limit 30) a
      left join public.platform_announcement_reads rd on rd.announcement_id = a.id and rd.user_id = uid), '[]'::jsonb),
    -- The database's clock, so the app can time the next change without trusting its own.
    'now', now(),
    -- The next moment the list changes by itself: a scheduled start, or the end of a running one.
    'nextChangeAt', (select min(t) from (
        select x.starts_at as t from public.platform_announcements x
         where x.status = 'published' and x.starts_at > now()
        union all
        select x.ends_at from public.platform_announcements x
         where x.status = 'published' and x.starts_at <= now() and x.ends_at > now()
      ) upcoming));
end
$$;

revoke all on function public.platform_my_announcements() from public, anon, authenticated;
grant execute on function public.platform_my_announcements() to authenticated;
