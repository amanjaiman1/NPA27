-- ════════════════════════════════════════════════════════════════
-- Last active checks
--
-- Proves inside the database that "Last active" in Admin → Users keeps a
-- time and nothing else: a browser can't read or write the table, an
-- account can mark only itself, a repeat within five minutes doesn't
-- write, only roles that can see accounts read the times, and deleting
-- an account deletes its time.
--
-- Run it in the Supabase SQL Editor after the migrations, or with
-- `npm run test:db`. One transaction, rolled back: it leaves no trace.
-- Success is one row: "All last active checks passed". A failure stops
-- the script with a message starting "FAIL:".
-- ════════════════════════════════════════════════════════════════

begin;

-- Throwaway accounts on the reserved .invalid domain: an Admin and a student.
insert into auth.users (id, email, created_at) values
  ('1a000000-0000-4000-8000-000000000001', 'admin@last-active-check.invalid', now() - interval '60 days'),
  ('1b000000-0000-4000-8000-000000000002', 'student@last-active-check.invalid', now() - interval '60 days');
insert into public.platform_admin_memberships (user_id, role)
  values ('1a000000-0000-4000-8000-000000000001', 'admin');

-- ── 1. A browser can mark its own account, and nothing else ───────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.platform_mark_active();

do $$
begin
  begin
    perform 1 from public.platform_last_active;
    raise exception 'FAIL: a browser read platform_last_active';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.platform_last_active (user_id) values ('1a000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: a browser wrote to platform_last_active';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.platform_admin_last_active('1a000000-0000-4000-8000-000000000001',
      array['1b000000-0000-4000-8000-000000000002']::uuid[]);
    raise exception 'FAIL: a browser called platform_admin_last_active';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform public.platform_mark_active();
  raise exception 'FAIL: a signed-out visitor called platform_mark_active';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ── 2. One time per account, moved at most every five minutes ─────
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare
  student constant uuid := '1b000000-0000-4000-8000-000000000002';
begin
  if (select active_at from public.platform_last_active where user_id = student) is distinct from now() then
    raise exception 'FAIL: marking active did not record the time';
  end if;
  update public.platform_last_active set active_at = now() - interval '4 minutes' where user_id = student;
  perform public.platform_mark_active();
  if (select active_at from public.platform_last_active where user_id = student) <> now() - interval '4 minutes' then
    raise exception 'FAIL: a report within five minutes of the last one was written';
  end if;
  update public.platform_last_active set active_at = now() - interval '6 minutes' where user_id = student;
  perform public.platform_mark_active();
  if (select active_at from public.platform_last_active where user_id = student) <> now() then
    raise exception 'FAIL: a report after five minutes did not move the time';
  end if;
  if exists (select 1 from public.platform_last_active where user_id = '1a000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: an account that never used the app has a time';
  end if;
end $$;

-- ── 3. Only roles that can see accounts read the times ────────────
do $$
declare
  times jsonb := public.platform_admin_last_active('1a000000-0000-4000-8000-000000000001',
    array['1a000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000002']::uuid[]);
begin
  if times is distinct from jsonb_build_object('1b000000-0000-4000-8000-000000000002', now()) then
    raise exception 'FAIL: the Admin got %, expected only the student''s time', times;
  end if;
  begin
    perform public.platform_admin_last_active('1b000000-0000-4000-8000-000000000002',
      array['1b000000-0000-4000-8000-000000000002']::uuid[]);
    raise exception 'FAIL: a student read last active times';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- ── 4. Deleting an account deletes its time ───────────────────────
delete from auth.users where id = '1b000000-0000-4000-8000-000000000002';
do $$
begin
  if exists (select 1 from public.platform_last_active where user_id = '1b000000-0000-4000-8000-000000000002') then
    raise exception 'FAIL: a deleted account left its last active time behind';
  end if;
end $$;

rollback;

select 'All last active checks passed' as result;
