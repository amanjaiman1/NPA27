-- ════════════════════════════════════════════════════════════════
-- Admin Center checks
--
-- Proves inside the database that the Admin Center's rules hold whatever
-- the app does: no table is reachable from a browser, admin functions are
-- closed to students, each role can do only its part, the last Super Admin
-- can't be removed, the audit log can't be edited, and reviews, feedback,
-- announcements and the changelog follow their rules.
--
-- Run it in the Supabase SQL Editor after the migrations, or with
-- `npm run test:db`. One transaction, rolled back: it leaves no trace.
-- Success is one row: "All platform checks passed". A failure stops the
-- script with a message starting "FAIL:".
-- ════════════════════════════════════════════════════════════════

begin;

-- Runs a statement that must fail with a message like `p_pattern`.
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

-- Throwaway accounts on the reserved .invalid domain. The newcomer joined
-- two days ago; everyone else two months ago.
insert into auth.users (id, email, created_at) values
  ('0a000000-0000-4000-8000-000000000001', 'owner@platform-check.invalid', now() - interval '60 days'),
  ('0b000000-0000-4000-8000-000000000002', 'admin@platform-check.invalid', now() - interval '60 days'),
  ('0c000000-0000-4000-8000-000000000003', 'moderator@platform-check.invalid', now() - interval '60 days'),
  ('0d000000-0000-4000-8000-000000000004', 'student@platform-check.invalid', now() - interval '60 days'),
  ('0e000000-0000-4000-8000-000000000005', 'newcomer@platform-check.invalid', now() - interval '2 days'),
  ('0f000000-0000-4000-8000-000000000006', 'owner-two@platform-check.invalid', now() - interval '60 days');

-- ── 1. No table is reachable from a browser ───────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

do $$
declare t text;
begin
  foreach t in array array['platform_admin_memberships', 'platform_settings', 'platform_admin_audit_log',
    'platform_changelog_entries', 'platform_reviews', 'platform_feedback', 'platform_feedback_notes',
    'platform_announcements', 'platform_announcement_reads'] loop
    perform public.test_expect_error(format('select count(*) from public.%I', t), 'permission denied%');
    perform public.test_expect_error(format('delete from public.%I', t), 'permission denied%');
  end loop;
  perform public.test_expect_error(
    $q$insert into public.platform_admin_memberships (user_id, role) values ('0d000000-0000-4000-8000-000000000004', 'super_admin')$q$,
    'permission denied%');
  perform public.test_expect_error(
    $q$update public.platform_admin_audit_log set reason = 'x'$q$, 'permission denied%');
  -- Admin functions are closed to students, whatever id they pass.
  perform public.test_expect_error(
    $q$select public.platform_admin_set_role('0d000000-0000-4000-8000-000000000004', '0d000000-0000-4000-8000-000000000004', 'admin')$q$,
    'permission denied%');
  perform public.test_expect_error(
    $q$select public.platform_admin_overview('0a000000-0000-4000-8000-000000000001')$q$, 'permission denied%');
  -- So is the usage counter, which would otherwise reveal another account's activity.
  perform public.test_expect_error(
    $q$select public.platform_usage_summary('0a000000-0000-4000-8000-000000000001')$q$, 'permission denied%');
  if public.platform_my_role() is not null then
    raise exception 'FAIL: a student has a role';
  end if;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform public.test_expect_error('select count(*) from public.platform_reviews', 'permission denied%');
  perform public.test_expect_error('select public.platform_my_review()', 'permission denied%');
  -- Anyone may read what is published (nothing yet).
  if (public.platform_public_reviews() ->> 'total')::int <> 0 then
    raise exception 'FAIL: reviews are public before any was published';
  end if;
end $$;
reset role;

-- Every function named platform_* opens to exactly its audience.
do $$
declare
  f record;
  admin_fn boolean;
  user_fn boolean;
  public_fn boolean;
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'platform\_%' loop
    admin_fn := f.proname like 'platform\_admin\_%';
    public_fn := f.proname like 'platform\_public\_%';
    user_fn := f.proname in ('platform_my_role', 'platform_my_review', 'platform_submit_review', 'platform_set_review_consent',
      'platform_withdraw_review', 'platform_delete_my_review', 'platform_submit_feedback', 'platform_attach_feedback_screenshot',
      'platform_my_feedback', 'platform_mark_feedback_seen', 'platform_my_announcements', 'platform_mark_announcement',
      'platform_mark_announcements_read', 'platform_review_invite', 'platform_mark_active', 'platform_mark_presence');
    if has_function_privilege('anon', f.oid, 'execute') <> public_fn then
      raise exception 'FAIL: anon execute on % is wrong', f.proname;
    end if;
    if has_function_privilege('authenticated', f.oid, 'execute') <> (public_fn or user_fn) then
      raise exception 'FAIL: authenticated execute on % is wrong', f.proname;
    end if;
    if admin_fn and not has_function_privilege('service_role', f.oid, 'execute') then
      raise exception 'FAIL: the service role can''t run %', f.proname;
    end if;
  end loop;
end $$;

-- ── 2. The owner's one-time setup, as in docs/ADMIN_SETUP.md ────────
insert into public.platform_admin_memberships (user_id, role)
values ('0a000000-0000-4000-8000-000000000001', 'super_admin')
on conflict (user_id) do update set role = 'super_admin';

do $$
begin
  if not exists (select 1 from public.platform_admin_audit_log
                  where action = 'role.granted' and target_id = '0a000000-0000-4000-8000-000000000001'
                    and actor_id is null and metadata ->> 'via' = 'sql') then
    raise exception 'FAIL: granting a role in the SQL Editor was not audited';
  end if;
end $$;

-- ── 3. Roles: what each may do, and who may change them ─────────────
set local role service_role;

do $$
declare
  owner uuid := '0a000000-0000-4000-8000-000000000001';
  adm uuid := '0b000000-0000-4000-8000-000000000002';
  modr uuid := '0c000000-0000-4000-8000-000000000003';
  student uuid := '0d000000-0000-4000-8000-000000000004';
begin
  -- With the default switches (supabase/tests/platform_trust.sql tries the others).
  if cardinality(public.platform_permissions('super_admin')) <> 12
     or 'settings.manage' = any (public.platform_permissions('admin'))
     or 'access.manage' = any (public.platform_permissions('admin'))
     or 'audit.read' = any (public.platform_permissions('admin'))
     or public.platform_permissions('moderator') <> array['admin.access', 'reviews.moderate', 'reviews.hide']
     or not ('feedback.manage' = any (public.platform_permissions('moderator', true)))
     or cardinality(public.platform_permissions('student')) <> 0 then
    raise exception 'FAIL: the permission table is not what the roles promise';
  end if;

  perform public.platform_admin_set_role(owner, adm, 'admin', 'Runs the platform day to day');
  perform public.platform_admin_set_role(owner, modr, 'moderator', null);
  if public.platform_admin_whoami(adm) ->> 'role' <> 'admin' or public.platform_admin_whoami(modr) ->> 'role' <> 'moderator' then
    raise exception 'FAIL: roles were not granted';
  end if;
  if public.platform_admin_whoami(student) is not null then
    raise exception 'FAIL: an ordinary account has a role';
  end if;
  if not exists (select 1 from public.platform_admin_audit_log where action = 'role.granted' and actor_id = owner
                  and target_id = adm::text and reason = 'Runs the platform day to day' and metadata ->> 'role' = 'admin') then
    raise exception 'FAIL: a role granted in the app was not audited with its actor and reason';
  end if;

  -- Only a Super Admin manages access, never their own, never to Super Admin.
  perform public.test_expect_error(format('select public.platform_admin_set_role(%L, %L, %L)', adm, student, 'moderator'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_set_role(%L, %L, %L)', modr, modr, 'admin'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_set_role(%L, %L, %L)', owner, owner, 'admin'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_set_role(%L, %L, %L)', owner, student, 'super_admin'), 'platform:invalid%');
  perform public.test_expect_error(format('select public.platform_admin_set_role(%L, %L, %L)', student, student, 'admin'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_revoke_role(%L, %L)', owner, owner), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_revoke_role(%L, %L)', adm, modr), 'platform:forbidden%');

  -- Each role reaches only its modules.
  perform public.platform_assert(owner, 'settings.manage');
  perform public.platform_assert(adm, 'users.suspend');
  perform public.platform_assert(modr, 'reviews.moderate');
  perform public.test_expect_error(format('select public.platform_assert(%L, %L)', adm, 'settings.manage'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_assert(%L, %L)', adm, 'audit.read'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_assert(%L, %L)', modr, 'users.read'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_assert(%L, %L)', modr, 'feedback.manage'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_list_users(%L)', modr), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_audit(%L)', adm), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_overview(%L)', student), 'platform:forbidden%');
end $$;

-- ── 4. The last Super Admin stays; the audit log can't be edited ────
reset role;

do $$
begin
  perform public.test_expect_error(
    $q$delete from public.platform_admin_memberships where user_id = '0a000000-0000-4000-8000-000000000001'$q$,
    'platform:last_super_admin%');
  perform public.test_expect_error(
    $q$update public.platform_admin_memberships set role = 'admin' where user_id = '0a000000-0000-4000-8000-000000000001'$q$,
    'platform:last_super_admin%');

  -- With a second Super Admin either may go, but never both at once.
  insert into public.platform_admin_memberships (user_id, role) values ('0f000000-0000-4000-8000-000000000006', 'super_admin');
  perform public.test_expect_error($q$delete from public.platform_admin_memberships where role = 'super_admin'$q$,
    'platform:last_super_admin%');
  delete from public.platform_admin_memberships where user_id = '0f000000-0000-4000-8000-000000000006';
  if (select count(*) from public.platform_admin_memberships where role = 'super_admin') <> 1 then
    raise exception 'FAIL: removing one of two Super Admins went wrong';
  end if;

  -- Deleting the account itself in Supabase takes its membership with it.
  insert into public.platform_admin_memberships (user_id, role) values ('0f000000-0000-4000-8000-000000000006', 'super_admin');
  delete from auth.users where id = '0f000000-0000-4000-8000-000000000006';
  if exists (select 1 from public.platform_admin_memberships where user_id = '0f000000-0000-4000-8000-000000000006') then
    raise exception 'FAIL: a deleted account kept its role';
  end if;
  if not exists (select 1 from public.platform_admin_audit_log where action = 'role.revoked'
                  and target_id = '0f000000-0000-4000-8000-000000000006' and metadata ->> 'accountDeleted' = 'true') then
    raise exception 'FAIL: a role ending with its account was not audited';
  end if;

  -- Append-only, for the owner and the service role alike.
  perform public.test_expect_error('update public.platform_admin_audit_log set reason = null', 'platform:audit_append_only%');
  perform public.test_expect_error('delete from public.platform_admin_audit_log', 'platform:audit_append_only%');
  perform public.test_expect_error('truncate public.platform_admin_audit_log', 'platform:audit_append_only%');
end $$;

set local role service_role;
do $$
begin
  perform public.test_expect_error('delete from public.platform_admin_audit_log', 'platform:audit_append_only%');
  perform public.test_expect_error('update public.platform_admin_audit_log set action = ''x.y''', 'platform:audit_append_only%');
end $$;
reset role;

-- ── 5. Reviews ──────────────────────────────────────────────────────
-- The student's records: study on five days, a Life Dashboard entry and a
-- habit check-in on two more. These don't count: a day with no hours, a
-- day before the account existed, a future day, an unticked habit, and the
-- Personal Diary.
insert into public.chronicle_state (user_id, data) values
('0d000000-0000-4000-8000-000000000004', jsonb_build_object(
  'journal', jsonb_build_array(
    jsonb_build_object('date', (current_date - 20)::text, 'totalHours', 4),
    jsonb_build_object('date', (current_date - 15)::text, 'totalHours', 5),
    jsonb_build_object('date', (current_date - 10)::text, 'totalHours', 2.5),
    jsonb_build_object('date', (current_date - 5)::text, 'totalHours', 6),
    jsonb_build_object('date', (current_date - 2)::text, 'totalHours', 3),
    jsonb_build_object('date', (current_date - 3)::text, 'totalHours', 0),
    jsonb_build_object('date', (current_date - 400)::text, 'totalHours', 8),
    jsonb_build_object('date', (current_date + 5)::text, 'totalHours', 8)),
  'lifeLog', jsonb_build_array(jsonb_build_object('date', (current_date - 1)::text, 'sleepHours', 7)),
  'habits', jsonb_build_array(jsonb_build_object('id', 'h1', 'log',
    jsonb_build_object((current_date - 7)::text, true, (current_date - 8)::text, false))),
  'reflections', jsonb_build_array(jsonb_build_object('date', (current_date - 30)::text, 'content', 'private words')))),
('0e000000-0000-4000-8000-000000000005', jsonb_build_object(
  'journal', jsonb_build_array(
    jsonb_build_object('date', (current_date - 9)::text, 'totalHours', 4),
    jsonb_build_object('date', (current_date - 6)::text, 'totalHours', 4),
    jsonb_build_object('date', (current_date - 4)::text, 'totalHours', 4),
    jsonb_build_object('date', (current_date - 1)::text, 'totalHours', 4),
    jsonb_build_object('date', current_date::text, 'totalHours', 4))));

-- The newcomer has records on five days, but only two since joining.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0e000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare e jsonb := public.platform_my_review() -> 'eligibility';
begin
  if (e ->> 'eligible')::boolean or (e ->> 'usageDays')::int <> 2 then
    raise exception 'FAIL: the newcomer''s eligibility is wrong: %', e;
  end if;
  perform public.test_expect_error($q$select public.platform_submit_review('{"rating":5,"body":"A thorough tracker that keeps me honest every day.","displayName":"New","feedbackConsent":true}')$q$,
    'platform:not_eligible%');
end $$;

select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare
  e jsonb := public.platform_my_review() -> 'eligibility';
  r jsonb;
begin
  if not (e ->> 'eligible')::boolean or (e ->> 'usageDays')::int <> 7 or (e ->> 'daysSinceFirstUse')::int <> 20
     or e -> 'features' <> '["habits", "journal", "life"]'::jsonb then
    raise exception 'FAIL: the student''s usage summary is wrong: %', e;
  end if;
  perform public.test_expect_error($q$select public.platform_submit_review('{"rating":5,"body":"Thirty characters of genuine praise here.","displayName":"Student"}')$q$,
    'platform:invalid%');
  -- A private review may be short; a public one needs 30 characters.
  perform public.test_expect_error($q$select public.platform_submit_review('{"rating":5,"body":"Too short","displayName":"Student","feedbackConsent":true,"publicConsent":true}')$q$,
    'platform:invalid%');
  perform public.test_expect_error($q$select public.platform_submit_review('{"rating":9,"body":"Thirty characters of genuine praise here.","displayName":"Student","feedbackConsent":true}')$q$,
    'platform:invalid%');
  perform public.test_expect_error($q$select public.platform_submit_review('{"rating":4,"body":"Thirty characters of genuine praise here.","displayName":"Student","feedbackConsent":true,"features":["payments"]}')$q$,
    'platform:invalid%');
  r := public.platform_submit_review('{"rating":4,"headline":"Keeps me honest","body":"The revision queue and habits keep my week on track.","useful":"The heatmap.","suggestions":"PRIVATE-SUGGESTION: a Hindi option","features":["revision","habits","journal","habits"],"stage":"prelims","displayName":"Asha V.","feedbackConsent":true,"publicConsent":true}');
  if r ->> 'status' <> 'pending' or r -> 'features' <> '["habits", "journal", "revision"]'::jsonb
     or (r ->> 'publicConsent')::boolean is not true or r ->> 'publicConsentAt' is null or r ? 'userId' then
    raise exception 'FAIL: a submitted review came back wrong: %', r;
  end if;
  -- A second submission edits the same review.
  perform public.platform_submit_review('{"rating":4,"headline":"Keeps me honest","body":"The revision queue and habits keep my week on track.","useful":"The heatmap.","suggestions":"PRIVATE-SUGGESTION: a Hindi option, please","features":["revision","habits","journal"],"stage":"prelims","displayName":"Asha V.","feedbackConsent":true,"publicConsent":true}');
end $$;
reset role;

do $$
begin
  if (select count(*) from public.platform_reviews where user_id = '0d000000-0000-4000-8000-000000000004') <> 1 then
    raise exception 'FAIL: one account has more than one review';
  end if;
  if (select status from public.platform_reviews where user_id = '0d000000-0000-4000-8000-000000000004') <> 'pending' then
    raise exception 'FAIL: changing only the private suggestions changed the review''s status';
  end if;
end $$;

-- Moderation, and what the public sees at each step.
set local role service_role;
do $$
declare
  modr uuid := '0c000000-0000-4000-8000-000000000003';
  rid uuid := (select id from public.platform_reviews where user_id = '0d000000-0000-4000-8000-000000000004');
  seen timestamptz := (select submitted_at from public.platform_reviews where id = rid);
  pub jsonb;
  r jsonb;
begin
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L, null, %L)',
    modr, rid, 'publish', seen - interval '1 minute'), 'platform:conflict%');
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L)', modr, rid, 'hide'),
    'platform:invalid%');
  r := public.platform_admin_moderate_review(modr, rid, 'publish', null, seen);
  if r ->> 'status' <> 'published' or r -> 'account' ->> 'emailConfirmed' is null then
    raise exception 'FAIL: publishing went wrong: %', r;
  end if;
  pub := public.platform_public_reviews();
  -- One review is fewer than the minimum for an average: none is given.
  if (pub ->> 'total')::int <> 1 or pub ->> 'averageRating' is not null then
    raise exception 'FAIL: the published review isn''t public, or an average was shown for one review: %', pub;
  end if;
  if pub::text like '%PRIVATE-SUGGESTION%' or pub -> 'items' -> 0 ? 'userId' or pub -> 'items' -> 0 ? 'suggestions'
     or pub -> 'items' -> 0 ? 'usage' or pub -> 'items' -> 0 ? 'id' or pub::text like '%0d000000%'
     or pub -> 'items' -> 0 ->> 'displayName' <> 'Asha V.' then
    raise exception 'FAIL: the public shape leaks or lacks something: %', pub;
  end if;
  perform public.platform_admin_respond_review(modr, rid, 'Thank you. A Hindi option is on the list.');
  if public.platform_public_reviews() -> 'items' -> 0 ->> 'response' is null then
    raise exception 'FAIL: the public response isn''t shown';
  end if;
  if exists (select 1 from public.platform_admin_audit_log where target_type = 'review' and (metadata::text like '%revision queue%'
              or coalesce(reason, '') like '%revision queue%' or metadata::text like '%PRIVATE%')) then
    raise exception 'FAIL: review text reached the audit log';
  end if;
  if not exists (select 1 from public.platform_admin_audit_log where action = 'review.published' and target_id = rid::text
                  and actor_id = modr and actor_role = 'moderator') then
    raise exception 'FAIL: publishing was not audited';
  end if;
end $$;
reset role;

-- The author edits what the public sees: back to moderation. Under the default
-- policy the approved version stays on the site until the edit is checked
-- (platform_trust.sql tries the other policy).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare r jsonb; pub jsonb;
begin
  r := public.platform_submit_review('{"rating":3,"headline":"Keeps me honest","body":"The revision queue keeps my week on track, mostly.","useful":"The heatmap.","features":["revision"],"stage":"prelims","displayName":"Asha V.","feedbackConsent":true,"publicConsent":true}');
  if r ->> 'status' <> 'pending' then
    raise exception 'FAIL: an edited published review didn''t go back to a moderator: %', r;
  end if;
  pub := public.platform_public_reviews();
  if (pub ->> 'total')::int <> 1 or pub -> 'items' -> 0 ->> 'body' <> 'The revision queue and habits keep my week on track.'
     or (pub -> 'items' -> 0 ->> 'rating')::int <> 4 then
    raise exception 'FAIL: the site didn''t keep the approved version while the edit waits: %', pub;
  end if;
end $$;
reset role;

set local role service_role;
do $$
declare
  modr uuid := '0c000000-0000-4000-8000-000000000003';
  rid uuid := (select id from public.platform_reviews where user_id = '0d000000-0000-4000-8000-000000000004');
begin
  perform public.platform_admin_moderate_review(modr, rid, 'publish');
end $$;
reset role;

-- The author withdraws public consent: off the site at once, kept privately.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  if (public.platform_public_reviews() ->> 'total')::int <> 1 then
    raise exception 'FAIL: the re-published review isn''t public';
  end if;
  r := public.platform_set_review_consent(false);
  if r ->> 'status' <> 'approved' or (public.platform_public_reviews() ->> 'total')::int <> 0 then
    raise exception 'FAIL: withdrawing consent didn''t take the review off the site: %', r;
  end if;
end $$;
reset role;

set local role service_role;
do $$
declare
  modr uuid := '0c000000-0000-4000-8000-000000000003';
  rid uuid := (select id from public.platform_reviews where user_id = '0d000000-0000-4000-8000-000000000004');
begin
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L)', modr, rid, 'publish'),
    'platform:invalid%');
end $$;
reset role;

-- Consent back on: a moderator looks again. Hidden with a reason the author sees.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
begin
  if public.platform_set_review_consent(true) ->> 'status' <> 'pending' then
    raise exception 'FAIL: renewed consent didn''t send the review back to a moderator';
  end if;
end $$;
reset role;

set local role service_role;
do $$
declare
  adm uuid := '0b000000-0000-4000-8000-000000000002';
  rid uuid := (select id from public.platform_reviews where user_id = '0d000000-0000-4000-8000-000000000004');
begin
  perform public.platform_admin_moderate_review(adm, rid, 'publish');
  -- Hiding needs one of the listed reasons.
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L, %L)', adm, rid, 'hide', 'no'),
    'platform:invalid%');
  perform public.platform_admin_moderate_review(adm, rid, 'hide', 'Mentions another student by name.', null, 'personal_info');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare r jsonb := public.platform_my_review() -> 'review';
begin
  if r ->> 'status' <> 'hidden' or r ->> 'moderationReason' <> 'Mentions another student by name.' then
    raise exception 'FAIL: the author can''t see why the review was hidden: %', r;
  end if;
  if public.platform_withdraw_review() ->> 'status' <> 'withdrawn' then
    raise exception 'FAIL: the author couldn''t withdraw the review';
  end if;
end $$;
reset role;

set local role service_role;
do $$
begin
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L)',
    '0b000000-0000-4000-8000-000000000002',
    (select id from public.platform_reviews where user_id = '0d000000-0000-4000-8000-000000000004'), 'publish'),
    'platform:invalid%');
  if (public.platform_public_reviews() ->> 'total')::int <> 0 then
    raise exception 'FAIL: a withdrawn review is public';
  end if;
end $$;
reset role;

-- ── 6. Feedback ─────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare
  f jsonb;
  i int;
begin
  f := public.platform_submit_feedback('{"category":"bug","message":"Saving a mock jumps to the top of the page.","shareEmail":true,"context":{"userAgent":"Firefox","screen":"390×844","installed":true,"secret":"dropped"}}');
  -- Asking to share the email changes nothing now: feedback never carries one (20261212120000_help_feedback.sql).
  if f ->> 'status' <> 'new' or f ? 'email' or f ? 'shareEmail' or f ? 'priority' then
    raise exception 'FAIL: submitted feedback came back wrong: %', f;
  end if;
  perform public.test_expect_error($q$select public.platform_submit_feedback('{"category":"praise","message":"Lovely app, thank you"}')$q$, 'platform:invalid%');
  perform public.test_expect_error($q$select public.platform_submit_feedback('{"category":"general","message":"short"}')$q$, 'platform:invalid%');
  perform public.test_expect_error(format('select public.platform_attach_feedback_screenshot(%L, %L)', f ->> 'id',
    '0e000000-0000-4000-8000-000000000005/' || (f ->> 'id') || '.webp'), 'platform:invalid%');
  perform public.platform_attach_feedback_screenshot((f ->> 'id')::uuid,
    '0d000000-0000-4000-8000-000000000004/' || (f ->> 'id') || '.webp');
  for i in 2..10 loop
    perform public.platform_submit_feedback(format('{"category":"general","message":"General message number %s."}', i)::jsonb);
  end loop;
  perform public.test_expect_error($q$select public.platform_submit_feedback('{"category":"general","message":"One message too many."}')$q$,
    'platform:rate_limited%');
end $$;

select set_config('request.jwt.claims', '{"sub":"0e000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
begin
  if jsonb_array_length(public.platform_my_feedback() -> 'items') <> 0 then
    raise exception 'FAIL: one account can see another''s feedback';
  end if;
end $$;
reset role;

do $$
begin
  if (select context from public.platform_feedback where message like 'Saving a mock%') <>
     '{"userAgent":"Firefox","screen":"390×844","installed":true}'::jsonb then
    raise exception 'FAIL: feedback kept details the form doesn''t offer';
  end if;
end $$;

set local role service_role;
do $$
declare
  owner uuid := '0a000000-0000-4000-8000-000000000001';
  adm uuid := '0b000000-0000-4000-8000-000000000002';
  modr uuid := '0c000000-0000-4000-8000-000000000003';
  fid uuid := (select id from public.platform_feedback where message like 'Saving a mock%');
  d jsonb;
begin
  perform public.test_expect_error(format('select public.platform_admin_list_feedback(%L)', modr), 'platform:forbidden%');
  perform public.platform_admin_update_settings(owner, '{"moderators_handle_feedback": true}');
  if (public.platform_admin_list_feedback(modr, '{"status":"all"}') ->> 'total')::int <> 10 then
    raise exception 'FAIL: a moderator allowed to handle feedback can''t list it';
  end if;
  perform public.platform_admin_update_settings(owner, '{"moderators_handle_feedback": false}');
  perform public.test_expect_error(format('select public.platform_admin_get_feedback(%L, %L)', modr, fid), 'platform:forbidden%');

  perform public.platform_admin_add_feedback_note(adm, fid, 'PRIVATE-NOTE: reproduced on Android');
  perform public.platform_admin_respond_feedback(adm, fid, 'Fixed in the next update. Thank you!');
  d := public.platform_admin_update_feedback(adm, fid, '{"status":"resolved","priority":"high"}');
  if d ->> 'status' <> 'resolved' or d ->> 'resolvedAt' is null or d ? 'email' or d ? 'shareEmail'
     or (d ->> 'noteCount')::int <> 1 then
    raise exception 'FAIL: updating feedback went wrong: %', d;
  end if;
  perform public.test_expect_error(format('select public.platform_admin_update_feedback(%L, %L, %L)', adm, fid, '{"status":"done"}'),
    'platform:invalid%');
  if not exists (select 1 from public.platform_admin_audit_log where action = 'feedback.updated' and target_id = fid::text
                  and metadata -> 'status' ->> 'to' = 'resolved') then
    raise exception 'FAIL: the feedback change was not audited';
  end if;
  if exists (select 1 from public.platform_admin_audit_log where metadata::text like '%PRIVATE-NOTE%' or reason like '%PRIVATE-NOTE%') then
    raise exception 'FAIL: a private note reached the audit log';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare mine jsonb := public.platform_my_feedback();
begin
  if mine::text like '%PRIVATE-NOTE%' or mine::text like '%"priority"%' then
    raise exception 'FAIL: the author can see private notes or the priority';
  end if;
  if not exists (select 1 from jsonb_array_elements(mine -> 'items') i
                  where i ->> 'response' = 'Fixed in the next update. Thank you!' and i ->> 'status' = 'resolved'
                    and (i ->> 'responseSeen')::boolean is false) then
    raise exception 'FAIL: the author can''t see the response: %', mine;
  end if;
  if (public.platform_mark_feedback_seen() ->> 'marked')::int <> 1 then
    raise exception 'FAIL: the response could not be marked as read';
  end if;
end $$;
reset role;

-- ── 7. Announcements ────────────────────────────────────────────────
set local role service_role;
do $$
declare
  adm uuid := '0b000000-0000-4000-8000-000000000002';
  a jsonb;
begin
  a := public.platform_admin_save_announcement(adm, null, '{"title":"Draft only","body":"Not ready yet.","category":"general"}');
  perform set_config('test.draft', a ->> 'id', true);
  a := public.platform_admin_save_announcement(adm, null, '{"title":"Planned maintenance","body":"Sync pauses on Sunday at 2 AM.","category":"maintenance"}');
  a := public.platform_admin_announcement_action(adm, (a ->> 'id')::uuid, 'publish', now() + interval '1 hour');
  if a ->> 'state' <> 'scheduled' then raise exception 'FAIL: a future start didn''t schedule: %', a; end if;
  perform set_config('test.scheduled', a ->> 'id', true);
  a := public.platform_admin_save_announcement(adm, null, '{"title":"Habits now count Roadmap work","body":"Connect a habit to the Roadmap.","category":"new_feature"}');
  a := public.platform_admin_announcement_action(adm, (a ->> 'id')::uuid, 'publish');
  if a ->> 'state' <> 'live' then raise exception 'FAIL: publishing now isn''t live: %', a; end if;
  perform set_config('test.live', a ->> 'id', true);
  perform public.test_expect_error(format('select public.platform_admin_delete_announcement(%L, %L)', adm, a ->> 'id'),
    'platform:invalid%');
  perform public.test_expect_error(format('select public.platform_admin_announcement_action(%L, %L, %L, null, %L)', adm,
    current_setting('test.draft'), 'publish', now() - interval '1 day'), 'platform:invalid%');
  perform public.test_expect_error(format('select public.platform_admin_save_announcement(%L, null, %L)',
    '0c000000-0000-4000-8000-000000000003', '{"title":"Moderator","body":"No."}'), 'platform:forbidden%');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare items jsonb := public.platform_my_announcements() -> 'items';
begin
  if jsonb_array_length(items) <> 1 or items -> 0 ->> 'title' <> 'Habits now count Roadmap work' then
    raise exception 'FAIL: students see drafts or scheduled announcements: %', items;
  end if;
  perform public.platform_mark_announcement((items -> 0 ->> 'id')::uuid, 'dismiss');
  if public.platform_my_announcements() -> 'items' -> 0 ->> 'dismissedAt' is null then
    raise exception 'FAIL: dismissing an announcement didn''t stick';
  end if;
  perform public.test_expect_error(format('select public.platform_mark_announcement(%L, %L)', current_setting('test.draft'), 'read'),
    'platform:not_found%');
end $$;

select set_config('request.jwt.claims', '{"sub":"0e000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare marked jsonb;
begin
  if public.platform_my_announcements() -> 'items' -> 0 ->> 'readAt' is not null then
    raise exception 'FAIL: one account''s read state reached another';
  end if;
  marked := public.platform_mark_announcements_read();
  if (marked ->> 'marked')::int <> 1 or public.platform_my_announcements() -> 'items' -> 0 ->> 'readAt' is null then
    raise exception 'FAIL: marking everything read missed the live announcement: %', marked;
  end if;
  marked := public.platform_mark_announcements_read();
  if (marked ->> 'marked')::int <> 0 then
    raise exception 'FAIL: marking everything read twice changed rows again: %', marked;
  end if;
end $$;
reset role;

-- Time passes: the scheduled one starts.
update public.platform_announcements set starts_at = now() - interval '1 minute' where id = current_setting('test.scheduled')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0e000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
begin
  if jsonb_array_length(public.platform_my_announcements() -> 'items') <> 2 then
    raise exception 'FAIL: a scheduled announcement didn''t appear once its time came';
  end if;
end $$;
reset role;

-- ── 8. Changelog ────────────────────────────────────────────────────
set local role service_role;
do $$
declare
  adm uuid := '0b000000-0000-4000-8000-000000000002';
  c jsonb;
  fid uuid := (select id from public.platform_feedback where message like 'Saving a mock%');
begin
  c := public.platform_admin_save_changelog(adm, null, '{"title":"Mocks keep your place when you save","summary":"Saving a mock no longer jumps to the top.","body":"Details.","category":"bug_fix"}');
  if c ->> 'slug' <> 'mocks-keep-your-place-when-you-save' or c ->> 'state' <> 'draft' then
    raise exception 'FAIL: a new changelog entry came back wrong: %', c;
  end if;
  perform public.platform_admin_update_feedback(adm, fid, jsonb_build_object('changelogEntryId', c ->> 'id'));
  if (public.platform_public_changelog() ->> 'total')::int <> 0
     or public.platform_public_changelog_entry('mocks-keep-your-place-when-you-save') is not null then
    raise exception 'FAIL: a changelog draft is public';
  end if;
  perform public.test_expect_error(format('select public.platform_admin_save_changelog(%L, null, %L)', adm,
    '{"title":"Mocks keep your place when you save","summary":"The same address again.","category":"bug_fix"}'), 'platform:conflict%');
  perform public.test_expect_error(format('select public.platform_admin_save_changelog(%L, null, %L)', adm,
    '{"title":"A picture","summary":"With an image from elsewhere.","category":"improvement","imageUrl":"//evil.example/x.png"}'),
    '%check constraint%');
  perform public.platform_admin_changelog_action(adm, (c ->> 'id')::uuid, 'publish');
  c := public.platform_public_changelog_entry('mocks-keep-your-place-when-you-save');
  if c is null or (c ->> 'requests')::int <> 1 or c ? 'status' or c ? 'createdAt' then
    raise exception 'FAIL: the published entry is missing or shows too much: %', c;
  end if;
  c := public.platform_admin_save_changelog(adm, null, '{"title":"Coming soon","summary":"Scheduled for next week.","category":"new_feature"}');
  perform public.platform_admin_changelog_action(adm, (c ->> 'id')::uuid, 'publish', now() + interval '7 days');
  if (public.platform_public_changelog() ->> 'total')::int <> 1 then
    raise exception 'FAIL: a scheduled changelog entry is public early';
  end if;
end $$;
reset role;

-- ── 9. Settings and the user directory ──────────────────────────────
set local role service_role;
do $$
declare
  owner uuid := '0a000000-0000-4000-8000-000000000001';
  adm uuid := '0b000000-0000-4000-8000-000000000002';
  student uuid := '0d000000-0000-4000-8000-000000000004';
  page jsonb;
  k text;
begin
  perform public.platform_admin_update_settings(owner, '{"review_min_days": 7, "app_notice": {"enabled": true, "message": "Sync pauses Sunday 2 AM.", "tone": "warning"}}');
  if (public.platform_settings_current() ->> 'review_min_days')::int <> 7 then
    raise exception 'FAIL: a setting didn''t save';
  end if;
  perform public.test_expect_error(format('select public.platform_admin_update_settings(%L, %L)', owner, '{"review_min_days": -1}'), 'platform:invalid%');
  perform public.test_expect_error(format('select public.platform_admin_update_settings(%L, %L)', owner, '{"service_key": "x"}'), 'platform:invalid%');
  perform public.test_expect_error(format('select public.platform_admin_update_settings(%L, %L)', owner,
    '{"app_notice": {"enabled": true, "message": "", "tone": "info"}}'), 'platform:invalid%');
  perform public.test_expect_error(format('select public.platform_admin_update_settings(%L, %L)', adm, '{"reviews_open": false}'), 'platform:forbidden%');
  if not exists (select 1 from public.platform_admin_audit_log where action = 'setting.updated' and target_id = 'review_min_days'
                  and metadata ->> 'from' = '14' and metadata ->> 'to' = '7') then
    raise exception 'FAIL: the setting change was not audited';
  end if;

  page := public.platform_admin_list_users(adm, 'platform-check.invalid', 'all', 2, 0);
  if (page ->> 'total')::int <> 5 or jsonb_array_length(page -> 'items') <> 2 then
    raise exception 'FAIL: the directory doesn''t search and page: %', page;
  end if;
  for k in select jsonb_object_keys(page -> 'items' -> 0) loop
    if k not in ('id', 'email', 'createdAt', 'lastSignInAt', 'emailConfirmedAt', 'bannedUntil', 'suspended', 'role') then
      raise exception 'FAIL: the directory returns %', k;
    end if;
  end loop;
  if (public.platform_admin_list_users(adm, null, 'staff') ->> 'total')::int <> 3 then
    raise exception 'FAIL: the staff filter is wrong';
  end if;
  if public.platform_admin_get_user(adm, student)::text like '%private words%' then
    raise exception 'FAIL: account details include chronicle data';
  end if;
  perform public.test_expect_error(format('select public.platform_admin_account_check(%L, %L, %L)', adm, owner, 'suspend'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_account_check(%L, %L, %L)', adm, adm, 'suspend'), 'platform:forbidden%');
  perform public.test_expect_error(format('select public.platform_admin_account_record(%L, %L, %L, %L)', adm, student, 'suspend', 'no'), 'platform:invalid%');
  perform public.platform_admin_account_check(adm, student, 'suspend');
  perform public.platform_admin_account_record(adm, student, 'suspend', 'Posting spam in feedback.');
  if public.platform_admin_get_user(adm, student) -> 'history' -> 0 ->> 'action' <> 'user.suspended' then
    raise exception 'FAIL: the suspension is not in the account''s history';
  end if;
end $$;
reset role;

-- A suspended Admin loses the Admin Center at once.
update auth.users set banned_until = now() + interval '1 day' where id = '0b000000-0000-4000-8000-000000000002';
set local role service_role;
do $$
begin
  if public.platform_admin_whoami('0b000000-0000-4000-8000-000000000002') is not null then
    raise exception 'FAIL: a suspended account kept the Admin Center';
  end if;
  perform public.test_expect_error(format('select public.platform_admin_overview(%L)', '0b000000-0000-4000-8000-000000000002'),
    'platform:forbidden%');
end $$;
reset role;
update auth.users set banned_until = null where id = '0b000000-0000-4000-8000-000000000002';

-- ── 10. Deleting accounts ───────────────────────────────────────────
do $$
declare
  log_before int := (select count(*) from public.platform_admin_audit_log);
begin
  delete from auth.users where id = '0d000000-0000-4000-8000-000000000004';
  if exists (select 1 from public.platform_reviews where user_id = '0d000000-0000-4000-8000-000000000004')
     or exists (select 1 from public.platform_feedback where user_id = '0d000000-0000-4000-8000-000000000004')
     or exists (select 1 from public.platform_announcement_reads where user_id = '0d000000-0000-4000-8000-000000000004') then
    raise exception 'FAIL: a deleted account left reviews, feedback or read state behind';
  end if;
  if (select count(*) from public.platform_admin_audit_log) <> log_before then
    raise exception 'FAIL: deleting an account changed the audit log';
  end if;
  -- The last Super Admin's account can be deleted in Supabase; the role goes with it.
  delete from auth.users where id = '0a000000-0000-4000-8000-000000000001';
  if exists (select 1 from public.platform_admin_memberships where role = 'super_admin') then
    raise exception 'FAIL: the deleted owner kept the Super Admin role';
  end if;
end $$;

rollback;

select 'All platform checks passed' as result;
