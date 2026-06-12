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
