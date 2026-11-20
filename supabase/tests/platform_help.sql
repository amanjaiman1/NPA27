-- ════════════════════════════════════════════════════════════════
-- Help & feedback checks
--
-- Proves inside the database that Help & feedback works without email:
-- feedback never carries an address, whatever is asked; crash reports are
-- recorded by the server alone, grouped by error and page, counted, kept
-- with their notes, capped and pruned; only the team (feedback.manage)
-- sees them; resolving and reopening are audited; and a resolved crash
-- that comes back is new again.
--
-- Run it in the Supabase SQL Editor after the migrations, or with
-- `npm run test:db`. One transaction, rolled back. Success is one row:
-- "All help checks passed". A failure stops it with "FAIL: …".
-- ════════════════════════════════════════════════════════════════

begin;

create function public.test_expect_error(p_sql text, p_pattern text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected an error like "%" from: %', p_pattern, p_sql;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like p_pattern then
    raise exception 'FAIL: "%" raised "%", expected "%"', p_sql, sqlerrm, p_pattern;
  end if;
end
$$;

-- Throwaway accounts on the reserved .invalid domain: an owner, a moderator, a student.
insert into auth.users (id, email, created_at) values
  ('2a000000-0000-4000-8000-000000000001', 'owner@help-check.invalid', now() - interval '200 days'),
  ('2c000000-0000-4000-8000-000000000003', 'moderator@help-check.invalid', now() - interval '200 days'),
  ('2d000000-0000-4000-8000-00000000000a', 'student@help-check.invalid', now() - interval '40 days');
insert into public.platform_admin_memberships (user_id, role) values
  ('2a000000-0000-4000-8000-000000000001', 'super_admin'),
  ('2c000000-0000-4000-8000-000000000003', 'moderator');

-- ── 1. Feedback carries no email, even when a stale form asks to share it ──
select set_config('request.jwt.claims', '{"sub":"2d000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare
  f jsonb;
  d jsonb;
begin
  f := public.platform_submit_feedback('{"category":"suggestion","message":"HELP-CHECK: a dark theme for the coach page.","shareEmail":true}');
  if f ? 'email' or f ? 'shareEmail' or f ->> 'status' <> 'new' then
    raise exception 'FAIL: the author''s copy of feedback mentions an email: %', f;
  end if;
  if (select share_email from public.platform_feedback where id = (f ->> 'id')::uuid) then
    raise exception 'FAIL: feedback was stored as sharing the email';
  end if;
  perform set_config('request.jwt.claims', '', true);
  d := public.platform_admin_get_feedback('2a000000-0000-4000-8000-000000000001', (f ->> 'id')::uuid);
  if d ? 'email' or d ? 'shareEmail' or d ->> 'userId' <> '2d000000-0000-4000-8000-00000000000a' then
    raise exception 'FAIL: the Admin Center''s copy of feedback mentions an email: %', d;
  end if;
  if strpos(public.platform_admin_list_feedback('2a000000-0000-4000-8000-000000000001', '{"status":"all"}')::text,
            'student@help-check.invalid') > 0 then
    raise exception 'FAIL: the feedback list shows the student''s email';
  end if;
end $$;

-- ── 2. Recording crashes: grouped, counted, with notes ────────────────
do $$
declare
  a jsonb;
  b jsonb;
  row public.platform_crash_reports;
begin
  a := public.platform_record_crash('{"message":"TypeError: HELP-CHECK x is undefined","source":"render","page":"/mocks",
    "stack":"at Mocks (mocks.js:1:2)","userAgent":"Firefox 132","signedIn":true,"online":true,"build":"abc1234"}');
  b := public.platform_record_crash('{"message":"TypeError: HELP-CHECK x is undefined","source":"window","page":"/mocks",
    "note":"I pressed Save twice.","userAgent":"Chrome 131","signedIn":false}');
  if not (a ->> 'stored')::boolean or a ->> 'id' <> b ->> 'id' or (b ->> 'reports')::int <> 2 then
    raise exception 'FAIL: the same crash on the same page wasn''t one row reported twice: % %', a, b;
  end if;
  select * into row from public.platform_crash_reports where id = (a ->> 'id')::uuid;
  if row.source <> 'window' or row.user_agent <> 'Chrome 131' or row.signed_in or row.stack <> 'at Mocks (mocks.js:1:2)'
     or row.build <> 'abc1234' or jsonb_array_length(row.notes) <> 1 or row.notes -> 0 ->> 'text' <> 'I pressed Save twice.' then
    raise exception 'FAIL: the crash row didn''t keep the latest details and the note: %', to_jsonb(row);
  end if;
  -- The same error on another page is another crash.
  if (public.platform_record_crash('{"message":"TypeError: HELP-CHECK x is undefined","page":"/journal"}') ->> 'id') = a ->> 'id' then
    raise exception 'FAIL: the same error on another page was folded into the first';
  end if;
  -- The page is a path, whatever arrives; the source is one of four.
  b := public.platform_record_crash('{"message":"HELP-CHECK odd input","page":"javascript:alert(1)","source":"elsewhere"}');
  select * into row from public.platform_crash_reports where id = (b ->> 'id')::uuid;
  if row.page <> '/' or row.source <> 'window' then
    raise exception 'FAIL: an odd page or source was stored as given: % %', row.page, row.source;
  end if;
  perform public.test_expect_error($q$select public.platform_record_crash('{"message":"   ","page":"/"}')$q$, 'platform:invalid%');
  -- Only the newest 20 notes are kept, oldest first.
  for i in 1..25 loop
    perform public.platform_record_crash(format('{"message":"HELP-CHECK noisy","page":"/coach","note":"note %s"}', i)::jsonb);
  end loop;
  select * into row from public.platform_crash_reports where message = 'HELP-CHECK noisy';
  if row.reports <> 25 or jsonb_array_length(row.notes) <> 20 or row.notes -> 0 ->> 'text' <> 'note 6'
     or row.notes -> 19 ->> 'text' <> 'note 25' then
    raise exception 'FAIL: the notes weren''t capped to the newest 20: % notes, first %, last %',
      jsonb_array_length(row.notes), row.notes -> 0 ->> 'text', row.notes -> 19 ->> 'text';
  end if;
end $$;

-- ── 3. Pruned after 90 days, and capped at 1,000 distinct crashes ─────
do $$
declare
  r jsonb;
begin
  update public.platform_crash_reports set last_seen_at = now() - interval '91 days' where message = 'HELP-CHECK odd input';
  perform public.platform_record_crash('{"message":"HELP-CHECK fresh","page":"/"}');
  if exists (select 1 from public.platform_crash_reports where message = 'HELP-CHECK odd input') then
    raise exception 'FAIL: a crash not reported for 90 days was kept';
  end if;
  insert into public.platform_crash_reports (fingerprint, message, source, page)
  select md5('filler ' || g), 'HELP-CHECK filler ' || g, 'window', '/'
    from generate_series(1, 1000 - (select count(*) from public.platform_crash_reports)::int) g;
  r := public.platform_record_crash('{"message":"HELP-CHECK one too many","page":"/"}');
  if (r ->> 'stored')::boolean or r ->> 'reason' <> 'full' then
    raise exception 'FAIL: a new crash was stored past the ceiling: %', r;
  end if;
  r := public.platform_record_crash('{"message":"HELP-CHECK fresh","page":"/"}');
  if not (r ->> 'stored')::boolean or (r ->> 'reports')::int <> 2 then
    raise exception 'FAIL: a known crash stopped counting at the ceiling: %', r;
  end if;
  delete from public.platform_crash_reports where message like 'HELP-CHECK filler %';
end $$;

-- ── 4. Only the team sees them; resolving, reopening and deleting are audited ──
do $$
declare
  owner uuid := '2a000000-0000-4000-8000-000000000001';
  modr uuid := '2c000000-0000-4000-8000-000000000003';
  student uuid := '2d000000-0000-4000-8000-00000000000a';
  cid uuid := (select id from public.platform_crash_reports where message = 'TypeError: HELP-CHECK x is undefined' and page = '/mocks');
  l jsonb;
  d jsonb;
begin
  perform public.test_expect_error(format('select public.platform_admin_list_crashes(%L)', student), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_list_crashes(%L)', modr), 'platform:forbidden%');
  perform public.platform_admin_update_settings(owner, '{"moderators_handle_feedback": true}');
  l := public.platform_admin_list_crashes(modr, 'new', 10, 0);
  if (l -> 'counts' ->> 'new')::int < 3 or jsonb_array_length(l -> 'items') < 3 or l -> 'items' -> 0 ? 'stack' then
    raise exception 'FAIL: the crash list came back wrong: %', l;
  end if;
  perform public.platform_admin_update_settings(owner, '{"moderators_handle_feedback": false}');
  perform public.test_expect_error(format('select public.platform_admin_get_crash(%L, %L)', modr, cid), 'platform:forbidden%');

  d := public.platform_admin_get_crash(owner, cid);
  if d ->> 'stack' <> 'at Mocks (mocks.js:1:2)' or jsonb_array_length(d -> 'notes') <> 1 or (d ->> 'reports')::int <> 2 then
    raise exception 'FAIL: a crash''s details came back wrong: %', d;
  end if;
  perform public.test_expect_error(format('select public.platform_admin_crash_action(%L, %L, %L)', owner, cid, 'ignore'), 'platform:invalid%');
  d := public.platform_admin_crash_action(owner, cid, 'resolve');
  if d ->> 'status' <> 'resolved' or d ->> 'resolvedAt' is null or d ->> 'resolvedByEmail' <> 'owner@help-check.invalid' then
    raise exception 'FAIL: resolving went wrong: %', d;
  end if;
  -- Resolving again changes and logs nothing.
  perform public.platform_admin_crash_action(owner, cid, 'resolve');
  if (select count(*) from public.platform_admin_audit_log where action = 'crash.resolved' and target_id = cid::text) <> 1 then
    raise exception 'FAIL: resolving twice was logged twice';
  end if;
  -- It comes back: new again.
  perform public.platform_record_crash('{"message":"TypeError: HELP-CHECK x is undefined","page":"/mocks"}');
  d := public.platform_admin_get_crash(owner, cid);
  if d ->> 'status' <> 'new' or d ->> 'resolvedAt' is not null or (d ->> 'reports')::int <> 3 then
    raise exception 'FAIL: a resolved crash that came back wasn''t new again: %', d;
  end if;
  perform public.platform_admin_crash_action(owner, cid, 'resolve');
  if public.platform_admin_crash_action(owner, cid, 'reopen') ->> 'status' <> 'new' then
    raise exception 'FAIL: reopening didn''t make it new';
  end if;
  -- Two statements: one statement's subquery would still see the row from before the delete.
  d := public.platform_admin_crash_action(owner, cid, 'delete');
  if not (d ->> 'deleted')::boolean then
    raise exception 'FAIL: deleting a crash answered %', d;
  end if;
  if exists (select 1 from public.platform_crash_reports where id = cid) then
    raise exception 'FAIL: deleting a crash left it behind';
  end if;
  perform public.test_expect_error(format('select public.platform_admin_get_crash(%L, %L)', owner, cid), 'platform:not_found%');
  if (select string_agg(action, ',' order by id) from public.platform_admin_audit_log where target_type = 'crash' and target_id = cid::text)
     <> 'crash.resolved,crash.resolved,crash.reopened,crash.deleted' then
    raise exception 'FAIL: the crash''s audit trail is wrong: %',
      (select string_agg(action, ',' order by id) from public.platform_admin_audit_log where target_type = 'crash' and target_id = cid::text);
  end if;
  if exists (select 1 from public.platform_admin_audit_log where target_type = 'crash' and metadata::text like '%HELP-CHECK%') then
    raise exception 'FAIL: the audit log holds a crash''s text';
  end if;
end $$;

-- ── 5. Who may call what ──────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.platform_record_crash(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.platform_record_crash(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.platform_record_crash(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.platform_admin_list_crashes(uuid, text, integer, integer)', 'execute')
     or not has_function_privilege('service_role', 'public.platform_admin_crash_action(uuid, uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.platform_crash_json(public.platform_crash_reports, boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.platform_submit_feedback(jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.platform_review_invite(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.platform_my_announcements()', 'execute') then
    raise exception 'FAIL: a function is open to the wrong audience';
  end if;
  if has_table_privilege('anon', 'public.platform_crash_reports', 'select')
     or has_table_privilege('authenticated', 'public.platform_crash_reports', 'select')
     or has_table_privilege('authenticated', 'public.platform_crash_reports', 'insert') then
    raise exception 'FAIL: the crash table is open to browsers';
  end if;
end $$;

rollback;

select 'All help checks passed' as result;
