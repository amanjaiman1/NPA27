-- Help & feedback without email
--
-- Help & feedback now lives behind a button in the app, and nothing in it
-- goes by email any more: messages and crash reports both reach the team in
-- the Admin Center, and the team answers in the app.
--
-- 1. Feedback no longer carries an email address. The form doesn't offer to
--    share one, platform_submit_feedback ignores `shareEmail`, and neither
--    the author's copy nor the Admin Center's says which address an account
--    has. (The share_email column stays, always false from now on, so
--    nothing is dropped.)
--
-- 2. Crash reports are kept for the team instead of being emailed. One row
--    per distinct crash, the same error on the same page, with how many
--    times it was reported, the latest technical details, and the notes
--    people wrote on the error screen when they pressed Send. A report never
--    holds an account id, a name, an email or anything written in the app.
--    Only the server (the service role, after its own checks in
--    app/api/report) can record one. A crash not reported for 90 days is
--    removed, and the table holds at most 1,000 distinct crashes, so a flood
--    of made-up errors can't fill the database. A crash marked resolved that
--    comes back is marked new again.
--
-- Additive, and safe to run more than once.

-- 1. Feedback, without email ───────────────────────────────────────────

create or replace function public.platform_feedback_json(f public.platform_feedback, p_for text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when f.id is null then null else
    jsonb_build_object(
      'id', f.id, 'category', f.category, 'message', f.message, 'status', f.status,
      'response', f.response, 'responseAt', f.response_at, 'createdAt', f.created_at, 'updatedAt', f.updated_at,
      'resolvedAt', f.resolved_at, 'hasScreenshot', f.screenshot_path is not null,
      'changelog', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title,
                      'published', c.status = 'published' and c.published_at <= now())
                      from public.platform_changelog_entries c where c.id = f.changelog_entry_id))
    || case when p_for = 'admin' then jsonb_build_object(
         'userId', f.user_id, 'priority', f.priority, 'context', f.context,
         'screenshotPath', f.screenshot_path,
         'noteCount', (select count(*) from public.platform_feedback_notes n where n.feedback_id = f.id))
       else jsonb_build_object('responseSeen', f.response_seen_at is not null and f.response_seen_at >= f.response_at) end
  end
$$;

-- Stores feedback from the caller: at most 10 a day. No email: the team answers in the app.
create or replace function public.platform_submit_feedback(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  in_category text := p_fields ->> 'category';
  in_message text := public.platform_clean(p_fields ->> 'message');
  ctx jsonb := case when jsonb_typeof(p_fields -> 'context') = 'object' then p_fields -> 'context' else '{}'::jsonb end;
  f public.platform_feedback;
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  if in_category is null or in_category not in ('bug', 'feature', 'suggestion', 'usability', 'general') then
    raise exception 'platform:invalid' using detail = 'Choose what the message is about.';
  end if;
  if in_message is null or char_length(in_message) not between 10 and 4000 then
    raise exception 'platform:invalid' using detail = 'Write 10 to 4,000 characters.';
  end if;
  if (select count(*) from public.platform_feedback x where x.user_id = uid and x.created_at > now() - interval '1 day') >= 10 then
    raise exception 'platform:rate_limited' using detail = 'That''s 10 messages today. Thank you; try again tomorrow.';
  end if;
  -- Only the details the form offers, each capped.
  ctx := jsonb_strip_nulls(jsonb_build_object(
    'userAgent', left(public.platform_clean(ctx ->> 'userAgent'), 400),
    'screen', case when (ctx ->> 'screen') ~ '^\d{2,5}×\d{2,5}$' then ctx ->> 'screen' end,
    'installed', case when jsonb_typeof(ctx -> 'installed') = 'boolean' then ctx -> 'installed' end));
  insert into public.platform_feedback (user_id, category, message, context, share_email)
  values (uid, in_category, in_message, ctx, false)
  returning * into f;
  -- The account id is for the server, which files the screenshot under it; it never reaches the browser.
  return public.platform_feedback_json(f, 'author') || jsonb_build_object('userId', uid);
end
$$;

-- 2. Crash reports ─────────────────────────────────────────────────────

create table if not exists public.platform_crash_reports (
  id              uuid primary key default gen_random_uuid(),
  -- md5 of the error message and the page: the same crash is one row, however often it's reported.
  fingerprint     text not null unique check (char_length(fingerprint) = 32),
  message         text not null check (char_length(message) between 1 and 1000),
  source          text not null check (source in ('render', 'root', 'window', 'promise')),
  page            text not null check (char_length(page) between 1 and 300),
  -- From the latest report.
  stack           text check (stack is null or char_length(stack) <= 6000),
  component_stack text check (component_stack is null or char_length(component_stack) <= 6000),
  digest          text check (digest is null or char_length(digest) <= 120),
  user_agent      text check (user_agent is null or char_length(user_agent) <= 400),
  build           text check (build is null or char_length(build) <= 40),
  signed_in       boolean,
  online          boolean,
  -- What people wrote on the error screen when they pressed Send, oldest first, the newest 20.
  notes           jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),
  reports         int not null default 1 check (reports >= 1),
  status          text not null default 'new' check (status in ('new', 'resolved')),
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users (id) on delete set null
);

create index if not exists platform_crash_reports_recent on public.platform_crash_reports (status, last_seen_at desc);
create index if not exists platform_crash_reports_last_seen on public.platform_crash_reports (last_seen_at);

-- Nobody reads or writes the table directly: only the functions below.
alter table public.platform_crash_reports enable row level security;
revoke all on public.platform_crash_reports from public, anon, authenticated;

-- Records one crash report, as app/api/report has already checked it.
-- Server only: granted to the service role, never to a browser.
create or replace function public.platform_record_crash(p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  in_message text := left(public.platform_clean(p_report ->> 'message'), 1000);
  in_source text := case when p_report ->> 'source' in ('render', 'root', 'window', 'promise') then p_report ->> 'source' else 'window' end;
  in_page text := left(coalesce(public.platform_clean(p_report ->> 'page'), '/'), 300);
  in_note text := left(public.platform_clean(p_report ->> 'note'), 2000);
  fp text;
  v public.platform_crash_reports;
begin
  if in_message is null then
    raise exception 'platform:invalid' using detail = 'A crash report needs the error message.';
  end if;
  if left(in_page, 1) <> '/' then
    in_page := '/';
  end if;
  fp := md5(in_message || '|' || in_page);

  -- Kept for 90 days after a crash was last reported.
  delete from public.platform_crash_reports x where x.last_seen_at < now() - interval '90 days';
  -- A ceiling for new crashes, so made-up errors can't fill the database. Known ones still count.
  if not exists (select 1 from public.platform_crash_reports x where x.fingerprint = fp)
     and (select count(*) from public.platform_crash_reports) >= 1000 then
    return jsonb_build_object('stored', false, 'reason', 'full');
  end if;

  insert into public.platform_crash_reports as c (fingerprint, message, source, page, stack, component_stack, digest,
      user_agent, build, signed_in, online, notes)
  values (fp, in_message, in_source, in_page,
      left(public.platform_clean(p_report ->> 'stack'), 6000),
      left(public.platform_clean(p_report ->> 'componentStack'), 6000),
      left(public.platform_clean(p_report ->> 'digest'), 120),
      left(public.platform_clean(p_report ->> 'userAgent'), 400),
      left(public.platform_clean(p_report ->> 'build'), 40),
      case when jsonb_typeof(p_report -> 'signedIn') = 'boolean' then (p_report ->> 'signedIn')::boolean end,
      case when jsonb_typeof(p_report -> 'online') = 'boolean' then (p_report ->> 'online')::boolean end,
      case when in_note is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('at', now(), 'text', in_note)) end)
  on conflict (fingerprint) do update
    set reports = c.reports + 1,
        last_seen_at = now(),
        source = excluded.source,
        stack = coalesce(excluded.stack, c.stack),
        component_stack = coalesce(excluded.component_stack, c.component_stack),
        digest = coalesce(excluded.digest, c.digest),
        user_agent = coalesce(excluded.user_agent, c.user_agent),
        build = coalesce(excluded.build, c.build),
        signed_in = coalesce(excluded.signed_in, c.signed_in),
        online = coalesce(excluded.online, c.online),
        notes = case when jsonb_array_length(excluded.notes) = 0 then c.notes else (
          select coalesce(jsonb_agg(z.e order by z.n), '[]'::jsonb)
            from (select t.e, t.n from jsonb_array_elements(c.notes || excluded.notes) with ordinality as t(e, n)
                   order by t.n desc limit 20) z) end,
        -- A crash marked resolved that comes back needs looking at again.
        status = 'new',
        resolved_at = null,
        resolved_by = null
  returning * into v;
  return jsonb_build_object('stored', true, 'id', v.id, 'reports', v.reports);
end
$$;

-- One crash for the Admin Center. The list leaves out the long parts.
create or replace function public.platform_crash_json(c public.platform_crash_reports, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.id is null then null else
    jsonb_build_object(
      'id', c.id, 'message', c.message, 'source', c.source, 'page', c.page, 'reports', c.reports,
      'status', c.status, 'firstSeenAt', c.first_seen_at, 'lastSeenAt', c.last_seen_at, 'resolvedAt', c.resolved_at,
      'noteCount', jsonb_array_length(c.notes), 'signedIn', c.signed_in, 'online', c.online,
      'userAgent', c.user_agent, 'build', c.build)
    || case when p_full then jsonb_build_object(
         'stack', c.stack, 'componentStack', c.component_stack, 'digest', c.digest, 'notes', c.notes,
         'resolvedByEmail', (select u.email from auth.users u where u.id = c.resolved_by))
       else '{}'::jsonb end
  end
$$;

-- New, resolved or all crashes, the most recently reported first, with how many are in each.
create or replace function public.platform_admin_list_crashes(
  p_actor uuid, p_status text default 'new', p_limit int default 25, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'feedback.manage');
  st text := coalesce(nullif(p_status, ''), 'new');
  lim int := greatest(1, least(coalesce(p_limit, 25), 100));
  off int := greatest(0, coalesce(p_offset, 0));
begin
  if st not in ('new', 'resolved', 'all') then
    raise exception 'platform:invalid' using detail = 'Unknown status.';
  end if;
  return jsonb_build_object(
    'counts', jsonb_build_object(
      'new', (select count(*) from public.platform_crash_reports c where c.status = 'new'),
      'resolved', (select count(*) from public.platform_crash_reports c where c.status = 'resolved')),
    'total', (select count(*) from public.platform_crash_reports c where st = 'all' or c.status = st),
    'limit', lim, 'offset', off,
    'items', coalesce((select jsonb_agg(public.platform_crash_json(x.c, false) order by (x.c).last_seen_at desc)
      from (select c from public.platform_crash_reports c
             where st = 'all' or c.status = st
             order by c.last_seen_at desc limit lim offset off) x), '[]'::jsonb));
end
$$;

create or replace function public.platform_admin_get_crash(p_actor uuid, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'feedback.manage');
  v public.platform_crash_reports;
begin
  select * into v from public.platform_crash_reports c where c.id = p_id;
  if v.id is null then
    raise exception 'platform:not_found' using detail = 'No crash report with that id. It may have been deleted.';
  end if;
  return public.platform_crash_json(v, true) || jsonb_build_object('history', public.platform_history('crash', p_id::text, 20));
end
$$;

-- resolve   new → resolved (it comes back as new if it's reported again)
-- reopen    resolved → new
-- delete    gone, notes and all
create or replace function public.platform_admin_crash_action(p_actor uuid, p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'feedback.manage');
  v public.platform_crash_reports;
begin
  if p_action is null or p_action not in ('resolve', 'reopen', 'delete') then
    raise exception 'platform:invalid' using detail = 'Unknown action.';
  end if;
  select * into v from public.platform_crash_reports c where c.id = p_id for update;
  if v.id is null then
    raise exception 'platform:not_found' using detail = 'No crash report with that id. It may have been deleted.';
  end if;
  if p_action = 'delete' then
    delete from public.platform_crash_reports c where c.id = p_id;
    perform public.platform_audit(p_actor, r, 'crash.deleted', 'crash', p_id::text, null,
      jsonb_build_object('reports', v.reports));
    return jsonb_build_object('deleted', true, 'id', p_id);
  end if;
  -- Already so: nothing to do, nothing to log.
  if (p_action = 'resolve' and v.status = 'resolved') or (p_action = 'reopen' and v.status = 'new') then
    return public.platform_crash_json(v, true);
  end if;
  update public.platform_crash_reports c
     set status = case when p_action = 'resolve' then 'resolved' else 'new' end,
         resolved_at = case when p_action = 'resolve' then now() end,
         resolved_by = case when p_action = 'resolve' then p_actor end
   where c.id = p_id
  returning * into v;
  perform public.platform_audit(p_actor, r, case when p_action = 'resolve' then 'crash.resolved' else 'crash.reopened' end,
    'crash', p_id::text, null, jsonb_build_object('reports', v.reports));
  return public.platform_crash_json(v, true) || jsonb_build_object('history', public.platform_history('crash', p_id::text, 20));
end
$$;

-- 3. Who may call what ─────────────────────────────────────────────────
-- The same rule as the earlier migrations, run again so the new and replaced
-- functions get exactly one audience. Recording a crash is the server's
-- alone; helpers stay closed.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'platform\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like 'platform\_admin\_%' or f.proname in ('platform_permissions', 'platform_record_crash') then
      execute format('grant execute on function %s to service_role', f.sig);
    elsif f.proname in ('platform_my_role', 'platform_my_review', 'platform_submit_review', 'platform_set_review_consent',
                        'platform_withdraw_review', 'platform_delete_my_review', 'platform_submit_feedback',
                        'platform_attach_feedback_screenshot', 'platform_my_feedback', 'platform_mark_feedback_seen',
                        'platform_my_announcements', 'platform_mark_announcement', 'platform_mark_announcements_read',
                        'platform_review_invite') then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.proname like 'platform\_public\_%' then
      execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
    end if;
  end loop;
end
$$;
