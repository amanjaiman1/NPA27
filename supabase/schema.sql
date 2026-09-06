-- ════════════════════════════════════════════════════════════════
-- The UPSC Chronicle — Cloud Sync schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → paste → Run.
-- ════════════════════════════════════════════════════════════════

-- One row per user holds that user's entire app state as a JSON blob.
create table if not exists public.chronicle_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: every user can only read/write their OWN row.
alter table public.chronicle_state enable row level security;

drop policy if exists "chronicle_state_select_own" on public.chronicle_state;
create policy "chronicle_state_select_own"
  on public.chronicle_state for select
  using (auth.uid() = user_id);

drop policy if exists "chronicle_state_insert_own" on public.chronicle_state;
create policy "chronicle_state_insert_own"
  on public.chronicle_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "chronicle_state_update_own" on public.chronicle_state;
create policy "chronicle_state_update_own"
  on public.chronicle_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "chronicle_state_delete_own" on public.chronicle_state;
create policy "chronicle_state_delete_own"
  on public.chronicle_state for delete
  using (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════
-- Background push
-- Everything below is additive and idempotent — safe to re-run over an
-- existing project alongside the cloud-sync table above.
-- ════════════════════════════════════════════════════════════════

-- One row per *device*, not per user: a phone and a laptop are two
-- subscriptions, and each has to be pushed to separately.
--
-- `endpoint` is the push service's URL for that device and is globally unique,
-- which makes it the natural conflict target — re-subscribing the same browser
-- updates the existing row instead of piling up duplicates.
--
-- `timezone` is the device's IANA zone, captured at subscribe time. The
-- dispatcher needs it: quiet hours, the digest hour and "today" are all meant
-- to be the user's wall clock, and a server evaluating in UTC would get every
-- one of them wrong.
create table if not exists public.chronicle_push_subscriptions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  endpoint      text        not null unique,
  key_p256dh    text        not null,
  key_auth      text        not null,
  -- 'macos' | 'android' | 'ios' | 'windows' | 'linux' | null when unknown.
  platform      text,
  timezone      text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- Bumped when a send fails softly; the row is deleted outright on a 404/410,
  -- which is how a push service says "this endpoint is gone for good".
  failure_count integer     not null default 0
);

create index if not exists chronicle_push_subscriptions_user_id_idx
  on public.chronicle_push_subscriptions (user_id);

alter table public.chronicle_push_subscriptions enable row level security;

drop policy if exists "chronicle_push_select_own" on public.chronicle_push_subscriptions;
create policy "chronicle_push_select_own"
  on public.chronicle_push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "chronicle_push_insert_own" on public.chronicle_push_subscriptions;
create policy "chronicle_push_insert_own"
  on public.chronicle_push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "chronicle_push_update_own" on public.chronicle_push_subscriptions;
create policy "chronicle_push_update_own"
  on public.chronicle_push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "chronicle_push_delete_own" on public.chronicle_push_subscriptions;
create policy "chronicle_push_delete_own"
  on public.chronicle_push_subscriptions for delete
  using (auth.uid() = user_id);


-- The dispatcher's own delivery bookkeeping: what it last sent, how many went
-- out today, whether today's digest has gone.
--
-- This is deliberately separate from the browser's `notifyLog`, which is
-- per-device and never synced. The server is a *third* sender alongside your
-- Mac and your phone, and it needs its own count or the rate limits would be
-- shared in ways that let one silence another.
create table if not exists public.chronicle_push_log (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  log        jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The dispatcher reads and writes this with the service-role key, which
-- bypasses RLS. Users get read-only access to their own row so the app can
-- show when the last push went out; nothing else can see it at all.
alter table public.chronicle_push_log enable row level security;

drop policy if exists "chronicle_push_log_select_own" on public.chronicle_push_log;
create policy "chronicle_push_log_select_own"
  on public.chronicle_push_log for select
  using (auth.uid() = user_id);
