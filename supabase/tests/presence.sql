-- ════════════════════════════════════════════════════════════════
-- Presence checks
--
-- Proves inside the database that "Last visit" in Admin → Users keeps
-- times and nothing else, and keeps them right: a browser can't read or
-- write the table, an account reports only for itself, a visit begins,
-- ends and resumes as the app says, a visit whose end never came still
-- ends, only roles that can see accounts read it, and deleting an account
-- deletes its row. Time passing is played by moving stored times back.
--
-- Run it in the Supabase SQL Editor after the migrations, or with
-- `npm run test:db`. One transaction, rolled back: it leaves no trace.
-- Success is one row: "All presence checks passed". A failure stops the
-- script with a message starting "FAIL:".
-- ════════════════════════════════════════════════════════════════

begin;

-- Throwaway accounts on the reserved .invalid domain: an Admin and a student.
insert into auth.users (id, email, created_at) values
  ('1a000000-0000-4000-8000-000000000001', 'admin@presence-check.invalid', now() - interval '60 days'),
  ('1b000000-0000-4000-8000-000000000002', 'student@presence-check.invalid', now() - interval '60 days');
insert into public.platform_admin_memberships (user_id, role)
  values ('1a000000-0000-4000-8000-000000000001', 'admin');

-- What the student's row says, as one line.
create function public.test_visit()
returns text
language sql
as $$
  select coalesce((
    select concat_ws(' ',
             'opened', coalesce(round(extract(epoch from now() - opened_at))::text, '-'),
             'seen', round(extract(epoch from now() - active_at))::text,
             'left', coalesce(round(extract(epoch from now() - left_at))::text, '-'))
      from public.platform_last_active
     where user_id = '1b000000-0000-4000-8000-000000000002'), 'none');
$$;

-- Moves the student's stored times back, its tabs' last reports included,
-- as if `p_seconds` had passed.
create function public.test_wait(p_seconds int)
returns void
language sql
as $$
  update public.platform_last_active
     set opened_at = opened_at - make_interval(secs => p_seconds),
         active_at = active_at - make_interval(secs => p_seconds),
         left_at = left_at - make_interval(secs => p_seconds),
         tabs = coalesce((select jsonb_object_agg(key, value || jsonb_build_object('at', (value ->> 'at')::numeric - p_seconds))
                            from jsonb_each(tabs)), '{}'::jsonb)
   where user_id = '1b000000-0000-4000-8000-000000000002';
$$;

create function public.test_expect_visit(p_what text, p_want text)
returns void
language plpgsql
as $$
begin
  if public.test_visit() is distinct from p_want then
    raise exception 'FAIL: % left the visit as "%", expected "%"', p_what, public.test_visit(), p_want;
  end if;
end
$$;

-- ── 1. A browser reports for its own account, and does nothing else ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.platform_mark_presence('here', 'laptop', 1);

do $$
begin
  begin
    perform 1 from public.platform_last_active;
    raise exception 'FAIL: a browser read platform_last_active';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.platform_last_active set left_at = now();
    raise exception 'FAIL: a browser wrote to platform_last_active';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.platform_admin_presence('1a000000-0000-4000-8000-000000000001',
      array['1b000000-0000-4000-8000-000000000002']::uuid[]);
    raise exception 'FAIL: a browser called platform_admin_presence';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform public.platform_mark_presence('here', 'tab', 1);
  raise exception 'FAIL: a signed-out visitor called platform_mark_presence';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ── 2. A visit begins, ends and resumes as the app reports ─────────
-- Run as the database owner from here, with the student's claims, so the
-- stored times can be moved between reports. Each tab sends its own id
-- and counts its reports.
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.test_expect_visit('the first report', 'opened 0 seen 0 left -');
do $$
begin
  if exists (select 1 from public.platform_last_active where user_id = '1a000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: an account that never reported has a row';
  end if;
end $$;

-- Still on screen: the minute's report moves only the last moment seen.
select public.test_wait(60);
select public.platform_mark_presence('here', 'laptop', 2);
select public.test_expect_visit('a report a minute on', 'opened 60 seen 0 left -');
-- A report the same tab already made (a retry, or one overtaken) changes nothing.
select public.test_wait(10);
select public.platform_mark_presence('here', 'laptop', 2);
select public.platform_mark_presence('left', 'laptop', 1);
select public.test_expect_visit('stale reports from the same tab', 'opened 70 seen 10 left -');

-- Off screen: the visit ends now, once.
select public.platform_mark_presence('left', 'laptop', 3);
select public.test_expect_visit('leaving', 'opened 70 seen 0 left 0');
select public.test_wait(5);
select public.platform_mark_presence('left', 'laptop', 4);
select public.test_expect_visit('leaving again', 'opened 75 seen 5 left 5');

-- Back within five minutes: the same visit, under way again.
select public.test_wait(115);
select public.platform_mark_presence('here', 'laptop', 5);
select public.test_expect_visit('coming back after two minutes', 'opened 190 seen 0 left -');

-- Two tabs (or a laptop and a phone): the visit lasts while either is on screen.
select public.test_wait(20);
select public.platform_mark_presence('here', 'phone', 1);
select public.test_wait(20);
select public.platform_mark_presence('left', 'phone', 2);
select public.test_expect_visit('the phone locked while the laptop is open', 'opened 230 seen 0 left -');
select public.test_wait(30);
select public.platform_mark_presence('left', 'laptop', 6);
select public.test_expect_visit('the laptop closed too', 'opened 260 seen 0 left 0');
-- A tab that went without a word doesn't keep the visit open past 150 seconds.
select public.platform_mark_presence('here', 'laptop', 7);
select public.platform_mark_presence('here', 'phone', 3);
select public.test_wait(160);
select public.platform_mark_presence('left', 'laptop', 8);
select public.test_expect_visit('the phone''s tab vanished, then the laptop closed', 'opened 420 seen 0 left 0');

-- Back after more than five minutes away: a new visit.
select public.test_wait(400);
select public.platform_mark_presence('here', 'laptop', 9);
select public.test_expect_visit('coming back after a while', 'opened 0 seen 0 left -');

-- Reports stopped without a 'left' (the browser was killed): the next one starts a new visit.
select public.test_wait(600);
select public.platform_mark_active();
select public.test_expect_visit('the previous release''s report, after ten silent minutes', 'opened 0 seen 0 left -');

-- Anything else is ignored.
select public.platform_mark_presence('gone', 'laptop', 10);
select public.platform_mark_presence(null, 'laptop', 11);
select public.platform_mark_presence('left', 'not a tab id!', 1);
select public.test_expect_visit('unknown reports', 'opened 0 seen 0 left -');

-- At most twenty tabs are kept, whatever a browser sends.
do $$
begin
  for i in 1 .. 40 loop
    perform public.platform_mark_presence('here', 'tab' || i, 1);
  end loop;
  if (select count(*) from jsonb_object_keys((select tabs from public.platform_last_active
                                               where user_id = '1b000000-0000-4000-8000-000000000002'))) > 20 then
    raise exception 'FAIL: the tabs list grew without bound';
  end if;
end $$;

-- ── 3. What the Admin Center reads ────────────────────────────────
do $$
declare
  admin constant uuid := '1a000000-0000-4000-8000-000000000001';
  student constant uuid := '1b000000-0000-4000-8000-000000000002';
  users constant uuid[] := array[admin, student];
  v jsonb;
begin
  -- On the site.
  v := public.platform_admin_presence(admin, users);
  if v ? admin::text then
    raise exception 'FAIL: an account never seen appears: %', v;
  end if;
  v := v -> student::text;
  if not (v ->> 'online')::boolean or v -> 'leftAt' <> 'null'::jsonb
     or (v ->> 'onlineUntil')::timestamptz <> now() + interval '150 seconds'
     or (v ->> 'openedAt')::timestamptz <> now() or (v ->> 'seenAt')::timestamptz <> now() then
    raise exception 'FAIL: a visit under way reads as %', v;
  end if;

  -- Left: when, and no longer on the site.
  update public.platform_last_active set tabs = '{}'::jsonb where user_id = student;
  perform public.platform_mark_presence('left', 'laptop', 20);
  perform public.test_wait(30);
  v := public.platform_admin_presence(admin, users) -> student::text;
  if (v ->> 'online')::boolean or v -> 'onlineUntil' <> 'null'::jsonb
     or (v ->> 'leftAt')::timestamptz <> now() - interval '30 seconds' then
    raise exception 'FAIL: a visit that ended reads as %', v;
  end if;

  -- Reports stopped without a 'left': on the site for 150 seconds after the last, then gone at that moment.
  perform public.test_wait(400);
  perform public.platform_mark_presence('here', 'laptop', 21);
  perform public.test_wait(149);
  if not (public.platform_admin_presence(admin, users) -> student::text ->> 'online')::boolean then
    raise exception 'FAIL: a visit stopped reporting 149 seconds ago is already over';
  end if;
  perform public.test_wait(2);
  v := public.platform_admin_presence(admin, users) -> student::text;
  if (v ->> 'online')::boolean or (v ->> 'leftAt')::timestamptz <> now() - interval '151 seconds' then
    raise exception 'FAIL: a visit whose end never came reads as %', v;
  end if;

  -- Only for roles that can see accounts.
  begin
    perform public.platform_admin_presence(student, users);
    raise exception 'FAIL: a student read presence';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- ── 4. Deleting an account deletes its row ────────────────────────
delete from auth.users where id = '1b000000-0000-4000-8000-000000000002';
select public.test_expect_visit('deleting the account', 'none');

rollback;

select 'All presence checks passed' as result;
