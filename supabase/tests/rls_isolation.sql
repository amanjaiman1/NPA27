-- ════════════════════════════════════════════════════════════════
-- Account isolation checks
--
-- Proves, inside the database, that one account cannot read, write or delete
-- another account's data, whatever the app does. Run it in the Supabase SQL
-- Editor after applying `schema.sql` and the migrations. It runs in a single
-- transaction and rolls everything back, so it leaves no trace: two throwaway
-- users are created, exercised and discarded.
--
-- Success looks like one row: "All isolation checks passed".
-- Any failure stops the script with a message starting "FAIL:".
--
-- `npm run test:db` runs this same file against a local Postgres (PGlite) with
-- Supabase's roles recreated, so it can be checked without a project.
-- ════════════════════════════════════════════════════════════════

begin;

-- Two throwaway accounts. Fixed ids keep the script readable; the emails use
-- the reserved `.invalid` TLD so they can never collide with a real person.
insert into auth.users (id, email)
values
  ('a0000000-0000-4000-8000-00000000000a', 'isolation-check-a@example.invalid'),
  ('b0000000-0000-4000-8000-00000000000b', 'isolation-check-b@example.invalid');

-- ── Account A saves its first snapshot ────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare r record;
begin
  select * into r from public.save_chronicle_state(
    '{"profile":{"name":"A"},"journal":[{"date":"2026-11-01","totalHours":6,"reflection":"private A"}]}'::jsonb, 0);
  if not r.saved or r.version <> 1 then
    raise exception 'FAIL: first save for A should create version 1, got saved=% version=%', r.saved, r.version;
  end if;
end $$;

-- ── Account B saves its own ───────────────────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare r record;
begin
  select * into r from public.save_chronicle_state('{"profile":{"name":"B"},"journal":[]}'::jsonb, 0);
  if not r.saved then raise exception 'FAIL: first save for B was refused'; end if;
end $$;

-- ── B cannot see, change, add or delete A's data ──────────────────
do $$
declare n int;
begin
  select count(*) into n from public.chronicle_state;
  if n <> 1 then raise exception 'FAIL: B can see % snapshots, expected only its own', n; end if;

  select count(*) into n from public.chronicle_state
   where user_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'FAIL: B can read A''s snapshot'; end if;

  begin
    update public.chronicle_state set data = '{}'::jsonb
     where user_id = 'a0000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: B was allowed to UPDATE chronicle_state directly';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.chronicle_state where user_id = 'a0000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL: B was allowed to DELETE from chronicle_state directly';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.chronicle_state (user_id, data)
    values ('a0000000-0000-4000-8000-00000000000a', '{}'::jsonb);
    raise exception 'FAIL: B was allowed to INSERT into chronicle_state directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B's save function only ever touches B's own row: a stale version is refused
-- and reports B's current version, never A's.
do $$
declare r record;
begin
  select * into r from public.save_chronicle_state('{"profile":{"name":"B2"}}'::jsonb, 99);
  if r.saved then raise exception 'FAIL: a save with a stale version was accepted'; end if;
  if r.version <> 1 then raise exception 'FAIL: conflict reported version %, expected B''s own 1', r.version; end if;

  select * into r from public.save_chronicle_state('{"profile":{"name":"B2"}}'::jsonb, 1);
  if not r.saved or r.version <> 2 then
    raise exception 'FAIL: a save on the current version should give version 2, got saved=% version=%', r.saved, r.version;
  end if;

  begin
    perform public.save_chronicle_state('[]'::jsonb, 2);
    raise exception 'FAIL: a non-object snapshot was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ── Push subscriptions and the delivery log stay with their owner ─
do $$
declare n int;
begin
  insert into public.chronicle_push_subscriptions (user_id, endpoint, key_p256dh, key_auth)
  values ('b0000000-0000-4000-8000-00000000000b', 'https://push.example.invalid/b', 'k', 'a');

  begin
    insert into public.chronicle_push_subscriptions (user_id, endpoint, key_p256dh, key_auth)
    values ('a0000000-0000-4000-8000-00000000000a', 'https://push.example.invalid/b-as-a', 'k', 'a');
    raise exception 'FAIL: B registered a device on A''s account';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.chronicle_push_log (user_id, log)
    values ('b0000000-0000-4000-8000-00000000000b', '{}'::jsonb);
    raise exception 'FAIL: a browser wrote to the push delivery log';
  exception when insufficient_privilege then null;
  end;

  -- The dispatcher's reader is for the server only. Whether a browser is refused
  -- outright or merely filtered by RLS, it must never come back with A's data.
  begin
    select count(*) into n from public.chronicle_dispatch_snapshots(
      array['a0000000-0000-4000-8000-00000000000a']::uuid[]);
    if n <> 0 then raise exception 'FAIL: B read A''s snapshot through the dispatcher reader'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── A cannot see or touch B's device ──────────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.chronicle_push_subscriptions;
  if n <> 0 then raise exception 'FAIL: A can see % of B''s devices', n; end if;

  update public.chronicle_push_subscriptions set user_id = 'a0000000-0000-4000-8000-00000000000a'
   where endpoint = 'https://push.example.invalid/b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A took over B''s device'; end if;

  delete from public.chronicle_push_subscriptions where endpoint = 'https://push.example.invalid/b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B''s device'; end if;

  select count(*) into n from public.chronicle_state;
  if n <> 1 then raise exception 'FAIL: A can see % snapshots, expected only its own', n; end if;

  -- Everything B did above must have left A's own data exactly as A saved it.
  if (select data -> 'profile' ->> 'name' from public.chronicle_state) is distinct from 'A' then
    raise exception 'FAIL: A''s snapshot was changed by another account';
  end if;
end $$;

-- ── Signed-out (anon) callers get nothing ─────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.chronicle_state;
    raise exception 'FAIL: an anonymous caller could read chronicle_state';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.save_chronicle_state('{}'::jsonb, 0);
    raise exception 'FAIL: an anonymous caller could save a snapshot';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── The service role (server only) sees both, trimmed ─────────────
reset role;
set local role service_role;

do $$
declare n int; j jsonb;
begin
  select count(*) into n from public.chronicle_dispatch_snapshots(
    array['a0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b']::uuid[]);
  if n <> 2 then raise exception 'FAIL: dispatcher saw % snapshots, expected 2', n; end if;

  select data -> 'journal' -> 0 into j from public.chronicle_dispatch_snapshots(
    array['a0000000-0000-4000-8000-00000000000a']::uuid[]);
  if j ? 'reflection' then raise exception 'FAIL: dispatcher snapshot still carries journal text'; end if;
  if (j ->> 'totalHours')::numeric <> 6 then raise exception 'FAIL: dispatcher snapshot lost study hours'; end if;

  -- A write that bypasses the save function still moves the version on, so a
  -- device holding the old version can never silently overwrite it.
  update public.chronicle_state set data = data
   where user_id = 'a0000000-0000-4000-8000-00000000000a';
  select version into n from public.chronicle_state
   where user_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 2 then raise exception 'FAIL: a direct update did not bump the version (got %)', n; end if;
end $$;

-- ── Deleting an account removes its data and nothing else ─────────
reset role;

do $$
declare n int;
begin
  delete from auth.users where id = 'a0000000-0000-4000-8000-00000000000a';

  select count(*) into n from public.chronicle_state
   where user_id = 'a0000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'FAIL: A''s snapshot survived account deletion'; end if;

  select count(*) into n from public.chronicle_state
   where user_id = 'b0000000-0000-4000-8000-00000000000b';
  if n <> 1 then raise exception 'FAIL: deleting A affected B''s snapshot'; end if;

  select count(*) into n from public.chronicle_push_subscriptions
   where user_id = 'b0000000-0000-4000-8000-00000000000b';
  if n <> 1 then raise exception 'FAIL: deleting A affected B''s device'; end if;
end $$;

rollback;

select 'All isolation checks passed' as result;
