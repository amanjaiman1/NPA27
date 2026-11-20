-- ════════════════════════════════════════════════════════════════
-- Live update checks
--
-- Proves inside the database that live updates reach only the people who may
-- receive them, that every kind of change sends one (and drafts don't reach
-- students), that a message never carries content, and that sending can
-- never break a change.
--
-- `npm run test:db` runs it against a stand-in for Supabase Realtime's
-- schema (supabase/tests/realtime_shim.sql). On a Supabase project you can
-- run it in the SQL Editor after the migrations. One transaction, rolled
-- back: it leaves no trace. Success is one row: "All live update checks
-- passed". A failure stops the script with a message starting "FAIL:".
-- ════════════════════════════════════════════════════════════════

begin;

create function public.test_live_error(p_sql text, p_pattern text)
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

-- Whether the caller may read a message on a topic: Realtime's own check
-- when someone joins a channel.
create function public.test_live_sees(p_id bigint, p_topic text)
returns boolean
language plpgsql
as $$
begin
  perform set_config('realtime.topic', p_topic, true);
  return exists (select 1 from realtime.messages where id = p_id);
end
$$;
grant execute on function public.test_live_error(text, text) to anon, authenticated;
grant execute on function public.test_live_sees(bigint, text) to anon, authenticated;

-- The messages sent since the last call, as "topic: areas" lines, then a
-- fresh start: the sender sends once per transaction, and this file is one.
-- Every payload is checked on the way: area names, and a version for synced
-- data, nothing else.
create function public.test_live_take()
returns text
language plpgsql
as $$
declare
  m record;
  out text := '';
begin
  for m in select * from realtime.messages where id > 0 order by id loop
    if m.extension <> 'broadcast' or m.event <> 'changed' or m.private is not true then
      raise exception 'FAIL: a message went out as %/%/private=%', m.extension, m.event, m.private;
    end if;
    if exists (select 1 from jsonb_object_keys(m.payload) k where k not in ('areas', 'version')) then
      raise exception 'FAIL: a message carries more than area names: %', m.payload;
    end if;
    if exists (select 1 from jsonb_array_elements_text(m.payload -> 'areas') a
                where a not in ('announcements', 'notice', 'reviews', 'feedback', 'changelog', 'users',
                                'settings', 'access', 'audit', 'chronicle', 'role', 'session')) then
      raise exception 'FAIL: a message names an unknown area: %', m.payload;
    end if;
    out := out || m.topic || ': ' || (select string_agg(a, ',' order by a) from jsonb_array_elements_text(m.payload -> 'areas') a)
               || case when m.payload ? 'version' then ' v' || (m.payload ->> 'version') else '' end || E'\n';
  end loop;
  delete from realtime.messages where id > 0;
  perform set_config('platform.live_sent', '', true);
  return out;
end
$$;

-- Fails unless exactly these lines were sent, in any order.
create function public.test_live_expect(p_what text, p_lines text[])
returns void
language plpgsql
as $$
declare
  got text[] := array(select l from unnest(string_to_array(trim(trailing E'\n' from public.test_live_take()), E'\n')) l where l <> '' order by l);
  want text[] := array(select l from unnest(p_lines) l order by l);
begin
  if got is distinct from want then
    raise exception 'FAIL: % sent %, expected %', p_what, got, want;
  end if;
end
$$;

-- Throwaway accounts on the reserved .invalid domain.
insert into auth.users (id, email, created_at) values
  ('1a000000-0000-4000-8000-000000000001', 'owner@live-check.invalid', now() - interval '60 days'),
  ('1b000000-0000-4000-8000-000000000002', 'suspended-admin@live-check.invalid', now() - interval '60 days'),
  ('1c000000-0000-4000-8000-000000000003', 'moderator@live-check.invalid', now() - interval '60 days'),
  ('1d000000-0000-4000-8000-000000000004', 'student-a@live-check.invalid', now() - interval '60 days'),
  ('1e000000-0000-4000-8000-000000000005', 'student-b@live-check.invalid', now() - interval '60 days');
insert into public.platform_admin_memberships (user_id, role) values
  ('1a000000-0000-4000-8000-000000000001', 'super_admin'),
  ('1b000000-0000-4000-8000-000000000002', 'admin'),
  ('1c000000-0000-4000-8000-000000000003', 'moderator');
update auth.users set banned_until = now() + interval '1 day' where id = '1b000000-0000-4000-8000-000000000002';
select public.test_live_take();

-- Rows to read back, one per topic, as Realtime's join check inserts them.
insert into realtime.messages (id, topic, extension, event, payload, private) values
  (-1, 'platform-updates', 'broadcast', 'check', '{}', true),
  (-2, 'platform-admin-updates', 'broadcast', 'check', '{}', true),
  (-3, 'account:1d000000-0000-4000-8000-000000000004', 'broadcast', 'check', '{}', true),
  (-4, 'account:1e000000-0000-4000-8000-000000000005', 'broadcast', 'check', '{}', true),
  (-5, 'platform-admin-updates', 'presence', 'check', '{}', true),
  (-6, 'someone-elses-room', 'broadcast', 'check', '{}', true);

-- ── 1. Who may listen, and that nobody can send ───────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
begin
  if not public.test_live_sees(-1, 'platform-updates') then
    raise exception 'FAIL: a student can''t listen for announcements';
  end if;
  if public.test_live_sees(-2, 'platform-admin-updates') then
    raise exception 'FAIL: a student can listen to the Admin Center''s channel';
  end if;
  if not public.test_live_sees(-3, 'account:1d000000-0000-4000-8000-000000000004') then
    raise exception 'FAIL: a student can''t listen to their own account''s channel';
  end if;
  if public.test_live_sees(-4, 'account:1e000000-0000-4000-8000-000000000005') then
    raise exception 'FAIL: a student can listen to another account''s channel';
  end if;
  if public.test_live_sees(-6, 'someone-elses-room') then
    raise exception 'FAIL: the policies open a topic they don''t name';
  end if;
  perform public.test_live_error(
    $q$insert into realtime.messages (topic, extension, event, payload, private) values ('platform-updates', 'broadcast', 'changed', '{"areas":["notice"]}', true)$q$,
    '%row-level security%');
  perform public.test_live_error(
    $q$insert into realtime.messages (topic, extension, event, payload, private) values ('account:1e000000-0000-4000-8000-000000000005', 'broadcast', 'changed', '{}', true)$q$,
    '%row-level security%');
  perform public.test_live_error(
    $q$select public.platform_live_send('platform-admin-updates', array['users'])$q$, 'permission denied%');
end
$$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if public.test_live_sees(-1, 'platform-updates') then
    raise exception 'FAIL: a visitor without an account can listen for announcements';
  end if;
end
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1c000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  if not public.test_live_sees(-2, 'platform-admin-updates') then
    raise exception 'FAIL: a Moderator can''t listen to the Admin Center''s channel';
  end if;
  if public.test_live_sees(-5, 'platform-admin-updates') then
    raise exception 'FAIL: presence is open on the Admin Center''s channel';
  end if;
  if public.test_live_sees(-3, 'account:1d000000-0000-4000-8000-000000000004') then
    raise exception 'FAIL: a Moderator can listen to a student''s account channel';
  end if;
end
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  if public.test_live_sees(-2, 'platform-admin-updates') then
    raise exception 'FAIL: a suspended account''s role still opens the Admin Center''s channel';
  end if;
end
$$;
reset role;

-- ── 2. Every kind of change sends, to the right channels ──────────
select public.test_live_take();

-- Synced data: every save, to that account only, with its version.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select public.save_chronicle_state('{"journal":[]}'::jsonb, 0);
select public.save_chronicle_state('{"journal":[],"habits":[]}'::jsonb, 1);
reset role;
select public.test_live_expect('two saves', array[
  'account:1d000000-0000-4000-8000-000000000004: chronicle v1',
  'account:1d000000-0000-4000-8000-000000000004: chronicle v2']);

-- Feedback: the Feedback Center and the author; once per change, however many rows.
insert into public.platform_feedback (id, user_id, category, message)
values ('2f000000-0000-4000-8000-000000000001', '1d000000-0000-4000-8000-000000000004', 'bug', 'The Save button on Mocks does nothing.');
select public.test_live_expect('new feedback', array[
  'platform-admin-updates: feedback,users',
  'account:1d000000-0000-4000-8000-000000000004: feedback']);
update public.platform_feedback set status = 'planned' where id = '2f000000-0000-4000-8000-000000000001';
update public.platform_feedback set priority = 'high' where id = '2f000000-0000-4000-8000-000000000001';
select public.test_live_expect('two feedback changes in one transaction', array[
  'platform-admin-updates: feedback,users',
  'account:1d000000-0000-4000-8000-000000000004: feedback']);
insert into public.platform_feedback_notes (feedback_id, author_id, body)
values ('2f000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', 'Reproduced on Android.');
select public.test_live_expect('a private note', array['platform-admin-updates: feedback,users']);
-- A note and a status change in one transaction: one message for the team.
insert into public.platform_feedback_notes (feedback_id, author_id, body)
values ('2f000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', 'Fixed in the next update.');
update public.platform_feedback set status = 'resolved' where id = '2f000000-0000-4000-8000-000000000001';
select public.test_live_expect('a note with a status change', array[
  'platform-admin-updates: feedback,users',
  'account:1d000000-0000-4000-8000-000000000004: feedback']);

-- Reviews: Reviews and Users in the Admin Center, and the author.
insert into public.platform_reviews (id, user_id, rating, body, display_name, feedback_consent, feedback_consent_at)
values ('3f000000-0000-4000-8000-000000000001', '1d000000-0000-4000-8000-000000000004', 4,
        'It keeps my revision honest and my weeks planned.', 'Student A', true, now());
select public.test_live_expect('a new review', array[
  'platform-admin-updates: reviews,users',
  'account:1d000000-0000-4000-8000-000000000004: reviews']);
update public.platform_reviews set status = 'approved' where id = '3f000000-0000-4000-8000-000000000001';
select public.test_live_expect('a moderation decision', array[
  'platform-admin-updates: reviews,users',
  'account:1d000000-0000-4000-8000-000000000004: reviews']);
insert into public.platform_review_invitations (user_id, dismissed_at) values ('1e000000-0000-4000-8000-000000000005', now());
select public.test_live_expect('the invitation dismissed', array['account:1e000000-0000-4000-8000-000000000005: reviews']);

-- Announcements: a draft stays with the team; publishing reaches everyone.
insert into public.platform_announcements (id, title, body, category)
values ('4f000000-0000-4000-8000-000000000001', 'Mock week starts', 'Every mock is open.', 'general');
select public.test_live_expect('a draft', array['platform-admin-updates: announcements']);
update public.platform_announcements set title = 'Mock week starts Monday' where id = '4f000000-0000-4000-8000-000000000001';
select public.test_live_expect('a draft edited', array['platform-admin-updates: announcements']);
update public.platform_announcements set status = 'published', starts_at = now() where id = '4f000000-0000-4000-8000-000000000001';
select public.test_live_expect('publishing', array['platform-admin-updates: announcements', 'platform-updates: announcements']);
insert into public.platform_announcement_reads (announcement_id, user_id, read_at)
values ('4f000000-0000-4000-8000-000000000001', '1d000000-0000-4000-8000-000000000004', now());
select public.test_live_expect('a student opening it', array[
  'platform-admin-updates: announcements',
  'account:1d000000-0000-4000-8000-000000000004: announcements']);

-- The changelog: drafts with the team, published entries for everyone.
insert into public.platform_changelog_entries (id, slug, title, summary, category)
values ('5f000000-0000-4000-8000-000000000001', 'faster-mocks', 'Faster mocks', 'Mocks open in half the time.', 'performance');
select public.test_live_expect('a changelog draft', array['platform-admin-updates: changelog']);
update public.platform_changelog_entries set status = 'published', published_at = now() where id = '5f000000-0000-4000-8000-000000000001';
select public.test_live_expect('publishing an update', array['platform-admin-updates: changelog', 'platform-updates: changelog']);

-- Settings: the Admin Center (with the roles' extra permissions) and every open app.
insert into public.platform_settings (key, value) values ('reviews_open', 'false'::jsonb)
on conflict (key) do update set value = excluded.value;
insert into public.platform_settings (key, value) values ('review_min_days', '7'::jsonb)
on conflict (key) do update set value = excluded.value;
select public.test_live_expect('two settings saved together', array[
  'platform-admin-updates: access,settings',
  'platform-updates: notice,reviews']);

-- Roles: Admin access, Users and the audit log, and the account itself.
insert into public.platform_admin_memberships (user_id, role) values ('1e000000-0000-4000-8000-000000000005', 'moderator');
select public.test_live_expect('a role granted', array[
  'platform-admin-updates: access,users',
  'platform-admin-updates: audit',
  'account:1e000000-0000-4000-8000-000000000005: role']);

-- Accounts, as Supabase Auth changes them.
insert into auth.users (id, email) values ('1f000000-0000-4000-8000-000000000006', 'newcomer@live-check.invalid');
select public.test_live_expect('a sign-up', array['platform-admin-updates: users']);
update auth.users set last_sign_in_at = now() where id = '1f000000-0000-4000-8000-000000000006';
select public.test_live_expect('a sign-in', array['platform-admin-updates: users']);
update auth.users set created_at = created_at where id = '1f000000-0000-4000-8000-000000000006';
select public.test_live_expect('an update Users doesn''t show', array[]::text[]);
update auth.users set banned_until = now() + interval '7 days' where id = '1f000000-0000-4000-8000-000000000006';
select public.test_live_expect('a suspension', array[
  'platform-admin-updates: users',
  'account:1f000000-0000-4000-8000-000000000006: session']);
delete from auth.users where id = '1f000000-0000-4000-8000-000000000006';
select public.test_live_expect('a deletion', array[
  'platform-admin-updates: users',
  'account:1f000000-0000-4000-8000-000000000006: session']);

-- ── 3. Sending never breaks a change ──────────────────────────────
-- Without Realtime: nothing sent, the change saved.
alter function realtime.send(jsonb, text, text, boolean) rename to send_away;
insert into public.platform_feedback (user_id, category, message)
values ('1d000000-0000-4000-8000-000000000004', 'suggestion', 'A dark theme for the PDF export.');
select public.test_live_expect('a change without Realtime', array[]::text[]);
alter function realtime.send_away(jsonb, text, text, boolean) rename to send;

-- With a Realtime that fails: the change is saved all the same.
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$ begin raise exception 'Realtime is down'; end $$;
insert into public.platform_feedback (user_id, category, message)
values ('1d000000-0000-4000-8000-000000000004', 'general', 'Still saved when Realtime fails.');
insert into auth.users (id, email) values ('1f000000-0000-4000-8000-000000000007', 'still-signs-up@live-check.invalid');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1d000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select public.save_chronicle_state('{"journal":[],"habits":[],"goals":[]}'::jsonb, 2);
reset role;
do $$
begin
  if (select count(*) from public.platform_feedback where message = 'Still saved when Realtime fails.') <> 1
     or not exists (select 1 from auth.users where id = '1f000000-0000-4000-8000-000000000007')
     or (select version from public.chronicle_state where user_id = '1d000000-0000-4000-8000-000000000004') <> 3 then
    raise exception 'FAIL: a failing Realtime got in the way of a change';
  end if;
end
$$;

rollback;

select 'All live update checks passed' as result;
