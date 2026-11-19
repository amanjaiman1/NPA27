-- ════════════════════════════════════════════════════════════════
-- Trust & review checks
--
-- Proves inside the database that the review system's rules hold whatever
-- the app does: the invitation asks only eligible people and respects
-- "later" and "no thanks"; private feedback stays private; public consent
-- is separate, recorded and withdrawable; edits keep earlier versions and
-- follow the edit policy; verification comes from records alone; moderators
-- can't change what anyone wrote; the permission switches work; the public
-- answer leaks nothing private; and the changelog's feedback themes show
-- only with real feedback behind them.
--
-- Run it in the Supabase SQL Editor after the migrations, or with
-- `npm run test:db`. One transaction, rolled back. Success is one row:
-- "All trust checks passed". A failure stops it with "FAIL: …".
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

-- Throwaway accounts on the reserved .invalid domain:
--   owner, moderator; A a long-time student with study on 20 days;
--   B a newcomer (3 days, 2 days of records); C a student of two months with
--   study on 6 days over the last 17.
insert into auth.users (id, email, created_at) values
  ('1a000000-0000-4000-8000-000000000001', 'owner@trust-check.invalid', now() - interval '200 days'),
  ('1c000000-0000-4000-8000-000000000003', 'moderator@trust-check.invalid', now() - interval '200 days'),
  ('1d000000-0000-4000-8000-00000000000a', 'student-a@trust-check.invalid', now() - interval '120 days'),
  ('1d000000-0000-4000-8000-00000000000b', 'student-b@trust-check.invalid', now() - interval '3 days'),
  ('1d000000-0000-4000-8000-00000000000c', 'student-c@trust-check.invalid', now() - interval '60 days');
insert into public.platform_admin_memberships (user_id, role) values
  ('1a000000-0000-4000-8000-000000000001', 'super_admin'),
  ('1c000000-0000-4000-8000-000000000003', 'moderator');

insert into public.chronicle_state (user_id, data) values
  ('1d000000-0000-4000-8000-00000000000a', jsonb_build_object(
     'journal', (select jsonb_agg(jsonb_build_object('date', (current_date - g)::text, 'totalHours', 3,
                   'highlights', 'PRIVATE-JOURNAL')) from generate_series(1, 39, 2) g),
     'mocks', jsonb_build_array(jsonb_build_object('date', (current_date - 4)::text)))),
  ('1d000000-0000-4000-8000-00000000000b', jsonb_build_object(
     'journal', (select jsonb_agg(jsonb_build_object('date', (current_date - g)::text, 'totalHours', 2)) from generate_series(1, 2) g))),
  ('1d000000-0000-4000-8000-00000000000c', jsonb_build_object(
     'journal', (select jsonb_agg(jsonb_build_object('date', (current_date - g)::text, 'totalHours', 4)) from generate_series(2, 17, 3) g)));

-- ── 1. The permission switches ──────────────────────────────────────
do $$
begin
  if public.platform_role_permissions('moderator', '{}') <> array['admin.access', 'reviews.moderate', 'reviews.hide']
     or public.platform_role_permissions('moderator', '{"moderators_hide_reviews": false}') <> array['admin.access', 'reviews.moderate']
     or public.platform_role_permissions('moderator', '{"moderators_handle_feedback": true}')
        <> array['admin.access', 'reviews.moderate', 'reviews.hide', 'feedback.manage']
     or 'audit.read' = any (public.platform_role_permissions('admin', '{}'))
     or not ('audit.read' = any (public.platform_role_permissions('admin', '{"admins_read_audit": true}')))
     or 'settings.manage' = any (public.platform_role_permissions('admin', '{"admins_read_audit": true}'))
     or cardinality(public.platform_role_permissions('student', '{"admins_read_audit": true}')) <> 0 then
    raise exception 'FAIL: the permission switches don''t give what they promise';
  end if;
  insert into public.platform_settings (key, value) values ('moderators_hide_reviews', 'false');
  if 'reviews.hide' = any (public.platform_permissions('moderator')) then
    raise exception 'FAIL: switching off moderators_hide_reviews didn''t reach the live permissions';
  end if;
  delete from public.platform_settings where key = 'moderators_hide_reviews';
end $$;

-- ── 2. The invitation: eligible people only, "later" and "no thanks" ─
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare
  inbox jsonb := public.platform_my_announcements();
begin
  if (inbox ->> 'reviewInvite')::boolean then
    raise exception 'FAIL: a newcomer without enough use was invited to review';
  end if;
  -- The live-updates migration's fields survive this one's new version of the function.
  if not (inbox ? 'now' and inbox ? 'nextChangeAt' and inbox ? 'items' and inbox ? 'unseenResponses' and inbox ? 'notice') then
    raise exception 'FAIL: platform_my_announcements lost a field: %', (select array_agg(k) from jsonb_object_keys(inbox) k);
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if not (public.platform_my_announcements() ->> 'reviewInvite')::boolean then
    raise exception 'FAIL: an eligible student wasn''t invited: %', public.platform_review_eligibility('1d000000-0000-4000-8000-00000000000c');
  end if;
  perform public.platform_review_invite('postpone');
  if (public.platform_my_announcements() ->> 'reviewInvite')::boolean then
    raise exception 'FAIL: "Later" didn''t stop the invitation for now';
  end if;
  perform public.test_expect_error($q$select public.platform_review_invite('nag')$q$, 'platform:invalid%');
end $$;
reset role;

-- Two weeks pass: it comes back. After the third "later" it stops for good.
update public.platform_review_invitations set postponed_until = now() - interval '1 minute'
 where user_id = '1d000000-0000-4000-8000-00000000000c';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if not (public.platform_my_announcements() ->> 'reviewInvite')::boolean then
    raise exception 'FAIL: a postponed invitation didn''t come back after its time';
  end if;
  perform public.platform_review_invite('postpone');
  perform public.platform_review_invite('postpone');
end $$;
reset role;
update public.platform_review_invitations set postponed_until = now() - interval '1 minute'
 where user_id = '1d000000-0000-4000-8000-00000000000c';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if (public.platform_my_announcements() ->> 'reviewInvite')::boolean then
    raise exception 'FAIL: the invitation kept coming back after three "later"s';
  end if;
end $$;

-- A asks not to be asked; and with invitations off, nobody is.
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  if not (public.platform_my_announcements() ->> 'reviewInvite')::boolean then
    raise exception 'FAIL: the long-time student wasn''t invited';
  end if;
end $$;
reset role;
insert into public.platform_settings (key, value) values ('review_invite_enabled', 'false');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  if (public.platform_my_announcements() ->> 'reviewInvite')::boolean then
    raise exception 'FAIL: invitations switched off still invited someone';
  end if;
end $$;
reset role;
delete from public.platform_settings where key = 'review_invite_enabled';

-- ── 3. Private feedback stays private; a public testimonial needs consent ─
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  -- Private feedback: a rating and an improvement, no long text.
  r := public.platform_submit_review('{"rating":2,"suggestions":"PRIVATE-IMPROVE: faster mocks","feedbackConsent":true,"displayName":"Asha","consentVersion":"2026-11-19","source":"invitation"}');
  if r ->> 'status' <> 'pending' or (r ->> 'publicConsent')::boolean or (r ->> 'live')::boolean or r ->> 'source' <> 'invitation' then
    raise exception 'FAIL: private feedback came back wrong: %', r;
  end if;
  if (public.platform_public_reviews() ->> 'total')::int <> 0 or public.platform_public_reviews()::text like '%PRIVATE-IMPROVE%' then
    raise exception 'FAIL: private feedback reached the public';
  end if;
  -- Public needs 30 characters of what they'd tell another aspirant.
  perform public.test_expect_error($q$select public.platform_set_review_consent(true)$q$, 'platform:invalid%');
  perform public.test_expect_error(
    $q$select public.platform_submit_review('{"rating":2,"body":"Short.","feedbackConsent":true,"publicConsent":true,"displayName":"Asha"}')$q$,
    'platform:invalid%');
end $$;

select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := public.platform_submit_review('{"rating":4,"headline":"One place for my whole week","body":"I log a day in five minutes and the revision list tells me what to do next.","problemBefore":"Three notebooks and no idea what I had revised.","changeNote":"I plan the week on Sunday and check it daily.","features":["journal","mocks","diary"],"stage":"prelims","aspirantType":"working","displayName":"Ravi Kumar","displayPreference":"initials","showTenure":true,"feedbackConsent":true,"publicConsent":true,"consentVersion":"2026-11-19"}');
  if r ->> 'status' <> 'pending' or r ->> 'publicName' <> 'R. K.' or (r ->> 'live')::boolean then
    raise exception 'FAIL: a public testimonial came back wrong: %', r;
  end if;
  if (public.platform_public_reviews() ->> 'total')::int <> 0 then
    raise exception 'FAIL: a testimonial went public before a moderator saw it';
  end if;
  -- Nobody can grant themselves verification or a status.
  r := public.platform_submit_review('{"rating":4,"headline":"One place for my whole week","body":"I log a day in five minutes and the revision list tells me what to do next.","problemBefore":"Three notebooks and no idea what I had revised.","changeNote":"I plan the week on Sunday and check it daily.","features":["journal","mocks","diary"],"stage":"prelims","aspirantType":"working","displayName":"Ravi Kumar","displayPreference":"initials","showTenure":true,"feedbackConsent":true,"publicConsent":true,"status":"published","badges":{"activeUser":true},"usage":{"usageDays":999}}');
  if r ->> 'status' <> 'pending' or (r -> 'usage' ->> 'usageDays')::int <> 6 or (r -> 'badges' ->> 'activeUser')::boolean then
    raise exception 'FAIL: a student set their own status or verification: %', r;
  end if;
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L)',
    '1c000000-0000-4000-8000-000000000003', r ->> 'id', 'publish'), 'permission denied%');
end $$;
reset role;

do $$
begin
  if (select count(*) from public.platform_review_consent_events e join public.platform_reviews v on v.id = e.review_id
       where v.user_id = '1d000000-0000-4000-8000-00000000000c') <> 2 then
    raise exception 'FAIL: consent wasn''t recorded once per permission';
  end if;
  if (select string_agg(e.kind, ',' order by e.id) from public.platform_review_consent_events e
        join public.platform_reviews v on v.id = e.review_id where v.user_id = '1d000000-0000-4000-8000-00000000000a') <> 'feedback_granted' then
    raise exception 'FAIL: private feedback recorded a public permission';
  end if;
end $$;

-- ── 4. Publishing: a frozen public version with badges from records ──
set local role service_role;
do $$
declare
  modr uuid := '1c000000-0000-4000-8000-000000000003';
  rid uuid := (select id from public.platform_reviews where user_id = '1d000000-0000-4000-8000-00000000000c');
  pub jsonb;
  item jsonb;
begin
  perform public.platform_admin_moderate_review(modr, rid, 'publish');
  pub := public.platform_public_reviews();
  item := pub -> 'items' -> 0;
  if (pub ->> 'total')::int <> 1 or item ->> 'displayName' <> 'R. K.' or item ->> 'aspirantType' <> 'working'
     or item ->> 'problemBefore' is null or item ->> 'slug' not like 'one-place-for-my-whole-week-review-%' then
    raise exception 'FAIL: the published review isn''t shown as written and chosen: %', item;
  end if;
  -- C: records on 6 days (not "active"), journal only (mocks and diary unverified), account 60 days old (not "established").
  if not (item -> 'badges' ->> 'verifiedUser')::boolean or (item -> 'badges' ->> 'activeUser')::boolean
     or item -> 'badges' -> 'features' <> '["journal"]'::jsonb or (item -> 'badges' ->> 'established')::boolean then
    raise exception 'FAIL: the badges don''t match the records: %', item -> 'badges';
  end if;
  if item ? 'id' or item ? 'userId' or item ? 'usage' or item ? 'suggestions' or item ? 'moderationCode'
     or pub::text like '%1d000000%' or pub::text like '%trust-check.invalid%' or pub::text like '%Ravi Kumar%' then
    raise exception 'FAIL: the public answer leaks something private: %', item;
  end if;
  if (item ->> 'story')::boolean or pub ->> 'averageRating' is not null or pub ->> 'distribution' is not null then
    raise exception 'FAIL: a short review became a story, or one review got an average: %', pub;
  end if;
  if public.platform_public_review(item ->> 'slug') ->> 'headline' <> 'One place for my whole week' then
    raise exception 'FAIL: the review can''t be found by its address';
  end if;
  perform public.platform_admin_moderate_review(modr, rid, 'feature');
  if not (public.platform_public_reviews() -> 'items' -> 0 ->> 'featured')::boolean then
    raise exception 'FAIL: featuring didn''t show on the site';
  end if;
end $$;
reset role;

-- ── 5. Edits: the earlier version is kept; the edit policy decides the site ─
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare r jsonb; pub jsonb;
begin
  r := public.platform_submit_review('{"rating":5,"headline":"One place for my whole week","body":"EDITED: I log a day in five minutes and plan the week on Sunday.","features":["journal"],"displayName":"Ravi Kumar","displayPreference":"initials","feedbackConsent":true,"publicConsent":true}');
  pub := public.platform_public_reviews();
  if r ->> 'status' <> 'pending' or not (r ->> 'live')::boolean or (pub ->> 'total')::int <> 1
     or pub -> 'items' -> 0 ->> 'body' like 'EDITED%' or (pub -> 'items' -> 0 ->> 'rating')::int <> 4
     or (pub -> 'items' -> 0 ->> 'featured')::boolean then
    raise exception 'FAIL: under keep_previous the approved version should stay, unfeatured, while the edit waits: % / %', r, pub;
  end if;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.platform_review_revisions rv join public.platform_reviews v on v.id = rv.review_id
       where v.user_id = '1d000000-0000-4000-8000-00000000000c' and rv.content ->> 'rating' = '4'
         and rv.content ->> 'problemBefore' = 'Three notebooks and no idea what I had revised.') <> 1 then
    raise exception 'FAIL: the earlier version wasn''t kept in the revision history';
  end if;
end $$;
insert into public.platform_settings (key, value) values ('review_edit_policy', '"remove_until_approved"');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  perform public.platform_submit_review('{"rating":5,"headline":"One place for my whole week","body":"EDITED AGAIN: I log a day in five minutes and plan the week on Sunday.","features":["journal"],"displayName":"Ravi Kumar","displayPreference":"initials","feedbackConsent":true,"publicConsent":true}');
  if (public.platform_public_reviews() ->> 'total')::int <> 0 then
    raise exception 'FAIL: under remove_until_approved an edited review stayed on the site';
  end if;
end $$;
reset role;
delete from public.platform_settings where key = 'review_edit_policy';

-- ── 6. Moderation actions, reasons and the hide switch ──────────────
set local role service_role;
do $$
declare
  owner uuid := '1a000000-0000-4000-8000-000000000001';
  modr uuid := '1c000000-0000-4000-8000-000000000003';
  rid uuid := (select id from public.platform_reviews where user_id = '1d000000-0000-4000-8000-00000000000c');
  r jsonb;
begin
  r := public.platform_admin_moderate_review(modr, rid, 'publish');
  if public.platform_public_reviews() -> 'items' -> 0 ->> 'body' not like 'EDITED AGAIN%' then
    raise exception 'FAIL: re-publishing didn''t show the new version';
  end if;
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L)', modr,
    (select id from public.platform_reviews where user_id = '1d000000-0000-4000-8000-00000000000a'), 'feature'), 'platform:invalid%');
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L, %L)', modr, rid, 'hide',
    'Negative about the product.'), 'platform:invalid%');
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L, %L, null, %L)', modr, rid,
    'hide', 'Too critical.', 'too_negative'), 'platform:invalid%');
end $$;
reset role;
insert into public.platform_settings (key, value) values ('moderators_hide_reviews', 'false');
set local role service_role;
do $$
declare
  owner uuid := '1a000000-0000-4000-8000-000000000001';
  modr uuid := '1c000000-0000-4000-8000-000000000003';
  rid uuid := (select id from public.platform_reviews where user_id = '1d000000-0000-4000-8000-00000000000c');
begin
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L, %L, null, %L)', modr, rid,
    'hide', 'Contains a phone number.', 'personal_info'), 'platform:forbidden%');
  perform public.platform_admin_moderate_review(owner, rid, 'hide', 'Contains a phone number.', null, 'personal_info');
  if (public.platform_public_reviews() ->> 'total')::int <> 0 then
    raise exception 'FAIL: a hidden review is still public';
  end if;
  perform public.test_expect_error(format('select public.platform_admin_moderate_review(%L, %L, %L)', modr, rid, 'restore'),
    'platform:forbidden%');
end $$;
reset role;
delete from public.platform_settings where key = 'moderators_hide_reviews';
set local role service_role;
do $$
declare
  modr uuid := '1c000000-0000-4000-8000-000000000003';
  rid uuid := (select id from public.platform_reviews where user_id = '1d000000-0000-4000-8000-00000000000c');
  r jsonb;
begin
  r := public.platform_admin_moderate_review(modr, rid, 'restore');
  if r ->> 'status' <> 'published' or (public.platform_public_reviews() ->> 'total')::int <> 1 then
    raise exception 'FAIL: restoring didn''t put the review back: %', r;
  end if;
  if not exists (select 1 from public.platform_admin_audit_log where action = 'review.hidden' and target_id = rid::text
                  and metadata ->> 'code' = 'personal_info')
     or not exists (select 1 from public.platform_admin_audit_log where action = 'review.restored' and target_id = rid::text)
     or not exists (select 1 from public.platform_admin_audit_log where action = 'review.featured' and target_id = rid::text) then
    raise exception 'FAIL: hiding, restoring or featuring wasn''t audited';
  end if;
  r := public.platform_admin_get_review(modr, rid);
  if jsonb_array_length(r -> 'consentHistory') <> 2 or jsonb_array_length(r -> 'revisions') < 2
     or (r -> 'verification' ->> 'activeDays')::int <> 15 or r -> 'usage' ->> 'usageDays' is null then
    raise exception 'FAIL: the moderator can''t see the review''s history and evidence: %', r;
  end if;
  if r::text like '%PRIVATE-JOURNAL%' then
    raise exception 'FAIL: the review module exposed the author''s journal';
  end if;
end $$;
reset role;

-- ── 7. A long-time student: active, established, a story; averages at the minimum ─
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  perform public.platform_submit_review(format('{"rating":2,"headline":"Honest, and still useful","body":"%s","useful":"%s","problemBefore":"%s","features":["journal","mocks"],"displayName":"Asha Verma","showTenure":true,"feedbackConsent":true,"publicConsent":true}',
    'The mocks page is slow on my phone, but the daily log and revision queue keep me consistent week after week.',
    repeat('The revision reminders arrive when I need them and the heatmap keeps me honest. ', 6),
    'I had no record of what I had studied or revised.')::jsonb);
  -- Students can't read the history tables directly.
  perform public.test_expect_error('select count(*) from public.platform_review_revisions', 'permission denied%');
  perform public.test_expect_error('select count(*) from public.platform_review_consent_events', 'permission denied%');
  perform public.test_expect_error('select count(*) from public.platform_review_invitations', 'permission denied%');
end $$;
reset role;
insert into public.platform_settings (key, value) values ('review_aggregate_min', '2');
set local role service_role;
do $$
declare
  modr uuid := '1c000000-0000-4000-8000-000000000003';
  aid uuid := (select id from public.platform_reviews where user_id = '1d000000-0000-4000-8000-00000000000a');
  pub jsonb;
  a jsonb;
begin
  perform public.platform_admin_moderate_review(modr, aid, 'publish');
  pub := public.platform_public_reviews();
  select i into a from jsonb_array_elements(pub -> 'items') i where i ->> 'headline' = 'Honest, and still useful';
  if not (a -> 'badges' ->> 'activeUser')::boolean or not (a -> 'badges' ->> 'established')::boolean
     or a -> 'badges' -> 'features' <> '["journal", "mocks"]'::jsonb or not (a ->> 'story')::boolean then
    raise exception 'FAIL: the long-time student''s badges or story are wrong: %', a;
  end if;
  -- Two published reviews meet the (lowered) minimum: a real average, ratings as they are.
  if (pub ->> 'averageRating')::numeric <> 3.5 or (pub -> 'distribution' ->> '2')::int <> 1
     or (pub -> 'distribution' ->> '5')::int <> 1 or (pub -> 'featureCounts' ->> 'journal')::int <> 2 then
    raise exception 'FAIL: the aggregate isn''t worked out from what''s published: %', pub;
  end if;
end $$;
reset role;
delete from public.platform_settings where key = 'review_aggregate_min';

-- ── 8. Taking it back: consent withdrawn, review withdrawn, review deleted ─
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := public.platform_set_review_consent(false, '2026-11-19');
  if (r ->> 'live')::boolean or r ->> 'status' <> 'approved'
     or exists (select 1 from jsonb_array_elements(public.platform_public_reviews() -> 'items') i where i ->> 'displayName' = 'R. K.') then
    raise exception 'FAIL: withdrawing public consent didn''t take the review down at once: %', r;
  end if;
  r := public.platform_withdraw_review();
  if r ->> 'status' <> 'withdrawn' then
    raise exception 'FAIL: the review couldn''t be withdrawn';
  end if;
end $$;
reset role;
do $$
begin
  if (select string_agg(e.kind, ',' order by e.id) from public.platform_review_consent_events e
        join public.platform_reviews v on v.id = e.review_id where v.user_id = '1d000000-0000-4000-8000-00000000000c')
     <> 'feedback_granted,public_granted,public_withdrawn,review_withdrawn' then
    raise exception 'FAIL: the consent history is incomplete';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
select public.platform_delete_my_review();
reset role;
do $$
begin
  if exists (select 1 from public.platform_review_revisions rv where not exists (select 1 from public.platform_reviews v where v.id = rv.review_id))
     or exists (select 1 from public.platform_review_consent_events e where not exists (select 1 from public.platform_reviews v where v.id = e.review_id))
     or exists (select 1 from public.platform_reviews where user_id = '1d000000-0000-4000-8000-00000000000c') then
    raise exception 'FAIL: deleting a review left its versions or consent history behind';
  end if;
  if exists (select 1 from public.platform_admin_audit_log where target_type = 'review'
              and (metadata::text like '%EDITED%' or coalesce(reason, '') like '%EDITED%' or metadata::text like '%Ravi%')) then
    raise exception 'FAIL: review text reached the audit log';
  end if;
end $$;

-- ── 9. Changelog: what changed, why, and themes only with real feedback ─
set local role service_role;
do $$
declare
  owner uuid := '1a000000-0000-4000-8000-000000000001';
  c jsonb;
begin
  perform public.test_expect_error(format('select public.platform_admin_save_changelog(%L, null, %L)', owner,
    '{"title":"Bigger tap targets","summary":"Buttons are easier to hit on phones.","category":"pricing"}'), 'platform:invalid%');
  c := public.platform_admin_save_changelog(owner, null, '{"title":"Habits count study you already logged","summary":"Study logged in the journal now fills in matching habits.","category":"accessibility","featureKey":"habits","whatChanged":"Habits read the journal, revision and the Roadmap.","whyItMatters":"You record each piece of work once.","askedTheme":"Study I log shouldn''t have to be entered again in Habits."}');
  perform public.platform_admin_changelog_action(owner, (c ->> 'id')::uuid, 'publish');
  perform set_config('test.entry', c ->> 'id', true);
  c := public.platform_public_changelog_entry('habits-count-study-you-already-logged');
  if c ->> 'whatChanged' is null or c ->> 'whyItMatters' is null or c ->> 'category' <> 'accessibility' then
    raise exception 'FAIL: the public entry lacks its new fields: %', c;
  end if;
  if c ->> 'askedTheme' is not null or jsonb_array_length(public.platform_public_you_asked()) <> 0 then
    raise exception 'FAIL: a feedback theme showed with no feedback behind it: %', c;
  end if;
end $$;
reset role;

-- A real request, linked by the team: now the theme shows, without the sender or the message.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select public.platform_submit_feedback('{"category":"feature","message":"FEEDBACK-SECRET: please stop making me log study twice"}');
reset role;
update public.platform_feedback set changelog_entry_id = current_setting('test.entry')::uuid
 where message like 'FEEDBACK-SECRET%';
do $$
declare y jsonb := public.platform_public_you_asked();
begin
  if jsonb_array_length(y) <> 1 or (y -> 0 ->> 'requests')::int <> 1
     or y -> 0 ->> 'askedTheme' <> 'Study I log shouldn''t have to be entered again in Habits.' then
    raise exception 'FAIL: "You asked, we improved" doesn''t show the linked theme: %', y;
  end if;
  if y::text like '%FEEDBACK-SECRET%' or y::text like '%1d000000%' or y::text like '%trust-check.invalid%' then
    raise exception 'FAIL: "You asked" exposed the feedback or its sender';
  end if;
  if not has_function_privilege('anon', 'public.platform_public_you_asked(integer)', 'execute')
     or not has_function_privilege('anon', 'public.platform_public_review(text)', 'execute')
     or has_function_privilege('anon', 'public.platform_review_invite(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.platform_review_invite(text)', 'execute')
     or has_function_privilege('authenticated', 'public.platform_review_snapshot(public.platform_reviews)', 'execute') then
    raise exception 'FAIL: a new function is open to the wrong audience';
  end if;
end $$;

rollback;

select 'All trust checks passed' as result;
