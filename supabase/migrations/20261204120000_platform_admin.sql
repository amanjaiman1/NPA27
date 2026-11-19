-- ════════════════════════════════════════════════════════════════
-- Admin Center: roles, reviews, feedback, announcements, changelog,
-- settings and an append-only audit log
--
-- Run after the earlier migrations, in the Supabase SQL Editor. Additive
-- and safe to re-run: nothing existing is dropped or rewritten, and
-- `chronicle_state` is not changed. One function reads it, to count the
-- days a person has used the app when they submit a review.
--
-- How access works
--   Every table below has Row Level Security on and no policies, and its
--   privileges are revoked from `anon` and `authenticated`, so nothing in
--   a browser can read or write it directly. Everything goes through the
--   functions at the end of this file:
--     platform_admin_*   service role only (the app's server). Each takes
--                        the actor's id, checks the actor's role itself and
--                        writes the audit entry in the same transaction.
--     platform_my_*, platform_submit_*, platform_mark_* and friends
--                        signed-in users, always acting on `auth.uid()`.
--     platform_public_*  anyone: published, consented content only.
--
-- A Super Admin is never created here or by the app. See
-- docs/ADMIN_SETUP.md for the one-time statement to run by hand.
-- ════════════════════════════════════════════════════════════════

-- 1. Tables ──────────────────────────────────────────────────────────

create table if not exists public.platform_admin_memberships (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('super_admin', 'admin', 'moderator')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- No foreign keys on purpose: an entry outlives the accounts it names, and
-- a cascading update would be refused by the append-only trigger.
create table if not exists public.platform_admin_audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_role  text,
  action      text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text not null check (target_type ~ '^[a-z_]+$'),
  target_id   text,
  reason      text check (reason is null or char_length(reason) <= 500),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.platform_changelog_entries (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique
                  check (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null check (char_length(title) between 3 and 120),
  summary         text not null check (char_length(summary) between 10 and 300),
  body            text not null default '' check (char_length(body) <= 8000),
  category        text not null
                  check (category in ('new_feature', 'improvement', 'bug_fix', 'performance', 'security')),
  feature_key     text check (feature_key is null or feature_key ~ '^[a-z][a-zA-Z]{1,40}$'),
  -- An https address, or a path on this site (never "//host", which would be another site).
  image_url       text check (image_url is null or (char_length(image_url) <= 500
                  and image_url ~ '^(https://[^\s"''<>]+|/[^/\s"''<>][^\s"''<>]*)$')),
  image_alt       text check (image_alt is null or char_length(image_alt) <= 200),
  seo_title       text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  status          text not null default 'draft' check (status in ('draft', 'published')),
  published_at    timestamptz,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status = 'draft' or published_at is not null)
);

create table if not exists public.platform_reviews (
  id                  uuid primary key default gen_random_uuid(),
  -- One review per account: a second submission edits the first.
  user_id             uuid not null unique references auth.users (id) on delete cascade,
  rating              smallint not null check (rating between 1 and 5),
  headline            text check (headline is null or char_length(headline) between 3 and 80),
  body                text not null check (char_length(body) between 30 and 1500),
  useful              text check (useful is null or char_length(useful) <= 600),
  -- Never published: read by the team only.
  suggestions         text check (suggestions is null or char_length(suggestions) <= 1000),
  features            text[] not null default '{}' check (cardinality(features) <= 16),
  stage               text check (stage is null or stage in ('foundation', 'prelims', 'mains', 'interview', 'working', 'repeat')),
  display_name        text not null check (char_length(display_name) between 2 and 40),
  feedback_consent    boolean not null default false,
  feedback_consent_at timestamptz,
  public_consent      boolean not null default false,
  public_consent_at   timestamptz,
  status              text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected', 'published', 'hidden', 'withdrawn')),
  -- How long the account had used the app when the review was last submitted.
  usage               jsonb not null default '{}'::jsonb,
  moderation_reason   text check (moderation_reason is null or char_length(moderation_reason) <= 500),
  moderated_by        uuid,
  moderated_at        timestamptz,
  response            text check (response is null or char_length(response) <= 1000),
  response_at         timestamptz,
  published_at        timestamptz,
  submitted_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  withdrawn_at        timestamptz,
  check (status <> 'published' or public_consent)
);

create table if not exists public.platform_feedback (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  category           text not null check (category in ('bug', 'feature', 'suggestion', 'usability', 'general')),
  message            text not null check (char_length(message) between 10 and 4000),
  -- Browser, window size and whether the app is installed: only when the
  -- person chose to include them.
  context            jsonb not null default '{}'::jsonb,
  -- The team may see the account's email, to reply outside the app.
  share_email        boolean not null default false,
  screenshot_path    text check (screenshot_path is null or char_length(screenshot_path) <= 200),
  status             text not null default 'new'
                     check (status in ('new', 'under_review', 'planned', 'in_progress', 'resolved', 'closed')),
  priority           text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  -- Shown to the person who sent it. Private notes live in their own table.
  response           text check (response is null or char_length(response) <= 2000),
  response_at        timestamptz,
  response_seen_at   timestamptz,
  changelog_entry_id uuid references public.platform_changelog_entries (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

create table if not exists public.platform_feedback_notes (
  id          uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.platform_feedback (id) on delete cascade,
  author_id   uuid,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create table if not exists public.platform_announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 3 and 120),
  body         text not null check (char_length(body) between 1 and 4000),
  category     text not null default 'general'
               check (category in ('product_update', 'new_feature', 'maintenance', 'important', 'general')),
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- When it appears. A time in the future schedules it.
  starts_at    timestamptz,
  ends_at      timestamptz,
  created_by   uuid,
  updated_by   uuid,
  published_by uuid,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status <> 'published' or starts_at is not null),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.platform_announcement_reads (
  announcement_id uuid not null references public.platform_announcements (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  read_at         timestamptz,
  dismissed_at    timestamptz,
  primary key (announcement_id, user_id)
);

create index if not exists platform_audit_created_idx on public.platform_admin_audit_log (created_at desc);
create index if not exists platform_audit_target_idx on public.platform_admin_audit_log (target_type, target_id);
create index if not exists platform_audit_actor_idx on public.platform_admin_audit_log (actor_id);
create index if not exists platform_reviews_status_idx on public.platform_reviews (status, updated_at desc);
create index if not exists platform_feedback_status_idx on public.platform_feedback (status, created_at desc);
create index if not exists platform_feedback_user_idx on public.platform_feedback (user_id, created_at desc);
create index if not exists platform_feedback_changelog_idx on public.platform_feedback (changelog_entry_id);
create index if not exists platform_feedback_notes_idx on public.platform_feedback_notes (feedback_id, created_at);
create index if not exists platform_announcements_live_idx on public.platform_announcements (status, starts_at desc);
create index if not exists platform_announcement_reads_user_idx on public.platform_announcement_reads (user_id);
create index if not exists platform_changelog_live_idx on public.platform_changelog_entries (status, published_at desc);

-- 2. Nothing is reachable from a browser except through the functions ───

alter table public.platform_admin_memberships enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_admin_audit_log enable row level security;
alter table public.platform_changelog_entries enable row level security;
alter table public.platform_reviews enable row level security;
alter table public.platform_feedback enable row level security;
alter table public.platform_feedback_notes enable row level security;
alter table public.platform_announcements enable row level security;
alter table public.platform_announcement_reads enable row level security;

revoke all on table
  public.platform_admin_memberships,
  public.platform_settings,
  public.platform_admin_audit_log,
  public.platform_changelog_entries,
  public.platform_reviews,
  public.platform_feedback,
  public.platform_feedback_notes,
  public.platform_announcements,
  public.platform_announcement_reads
from anon, authenticated;

-- Screenshots attached to feedback. Private, images only, 2 MB. No storage
-- policies: only the server (service role) writes them or signs links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('platform-feedback', 'platform-feedback', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 3. Triggers ────────────────────────────────────────────────────────

create or replace function public.platform_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists platform_memberships_touch on public.platform_admin_memberships;
create trigger platform_memberships_touch before update on public.platform_admin_memberships
  for each row execute function public.platform_touch();
drop trigger if exists platform_reviews_touch on public.platform_reviews;
create trigger platform_reviews_touch before update on public.platform_reviews
  for each row execute function public.platform_touch();
drop trigger if exists platform_feedback_touch on public.platform_feedback;
create trigger platform_feedback_touch before update on public.platform_feedback
  for each row execute function public.platform_touch();
drop trigger if exists platform_announcements_touch on public.platform_announcements;
create trigger platform_announcements_touch before update on public.platform_announcements
  for each row execute function public.platform_touch();
drop trigger if exists platform_changelog_touch on public.platform_changelog_entries;
create trigger platform_changelog_touch before update on public.platform_changelog_entries
  for each row execute function public.platform_touch();

-- The platform always keeps a Super Admin. The one exception is the account
-- itself being deleted in Supabase: its membership goes with it.
create or replace function public.platform_guard_super_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining int;
begin
  if old.role <> 'super_admin' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.role = 'super_admin' then return new; end if;
  if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  -- Lock the Super Admin rows, so two removals at once can't both pass.
  perform 1 from public.platform_admin_memberships where role = 'super_admin' for update;
  select count(*) into remaining from public.platform_admin_memberships
   where role = 'super_admin' and user_id <> old.user_id;
  if remaining = 0 then
    raise exception 'platform:last_super_admin'
      using detail = 'The platform must keep at least one Super Admin. Add another first.';
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists platform_memberships_guard on public.platform_admin_memberships;
create trigger platform_memberships_guard before update or delete on public.platform_admin_memberships
  for each row execute function public.platform_guard_super_admins();

-- Every role change is audited, including ones made by hand in the SQL
-- Editor. The app's functions name the actor and the reason in
-- `platform.actor` and `platform.reason` before they change a row.
create or replace function public.platform_log_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := nullif(current_setting('platform.actor', true), '')::uuid;
  why text := nullif(current_setting('platform.reason', true), '');
  act text;
  target uuid;
  meta jsonb;
begin
  if tg_op = 'INSERT' then
    act := 'role.granted'; target := new.user_id; meta := jsonb_build_object('role', new.role);
  elsif tg_op = 'UPDATE' then
    if new.role = old.role then return null; end if;
    act := 'role.changed'; target := new.user_id; meta := jsonb_build_object('from', old.role, 'to', new.role);
  else
    act := 'role.revoked'; target := old.user_id; meta := jsonb_build_object('role', old.role);
    if not exists (select 1 from auth.users where id = old.user_id) then
      meta := meta || '{"accountDeleted": true}'::jsonb;
    end if;
  end if;
  if actor is null then meta := meta || '{"via": "sql"}'::jsonb; end if;
  insert into public.platform_admin_audit_log (actor_id, actor_role, action, target_type, target_id, reason, metadata)
  values (
    actor,
    (select m.role from public.platform_admin_memberships m where m.user_id = actor),
    act, 'user', target::text, left(why, 500), meta
  );
  return null;
end
$$;

drop trigger if exists platform_memberships_log on public.platform_admin_memberships;
create trigger platform_memberships_log after insert or update or delete on public.platform_admin_memberships
  for each row execute function public.platform_log_membership();

-- The audit log is append-only for everyone, the service role included.
create or replace function public.platform_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'platform:audit_append_only'
    using detail = 'Audit entries can''t be changed or deleted.';
end
$$;

drop trigger if exists platform_audit_no_change on public.platform_admin_audit_log;
create trigger platform_audit_no_change before update or delete on public.platform_admin_audit_log
  for each row execute function public.platform_audit_append_only();
drop trigger if exists platform_audit_no_truncate on public.platform_admin_audit_log;
create trigger platform_audit_no_truncate before truncate on public.platform_admin_audit_log
  for each statement execute function public.platform_audit_append_only();

-- 4. Helpers (not callable from outside) ─────────────────────────────

-- Each setting's default. A stored row overrides it.
create or replace function public.platform_settings_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'review_min_days', 14,
    'review_min_usage_days', 5,
    'reviews_open', true,
    'testimonials_on_home', true,
    'testimonials_home_count', 3,
    'testimonials_on_feature_pages', true,
    'moderators_handle_feedback', false,
    'support_email', '',
    'announcement_default_days', 14,
    'announcement_default_category', 'general',
    'app_notice', jsonb_build_object('enabled', false, 'message', '', 'tone', 'info')
  )
$$;

create or replace function public.platform_settings_current()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.platform_settings_defaults()
         || coalesce((select jsonb_object_agg(s.key, s.value) from public.platform_settings s
                       where public.platform_settings_defaults() ? s.key), '{}'::jsonb)
$$;

-- What each role may do. The same table as src/lib/platform/roles.ts; a
-- test compares the two.
create or replace function public.platform_permissions(p_role text, p_moderators_handle_feedback boolean default false)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'super_admin' then array[
      'admin.access', 'analytics.read', 'users.read', 'users.suspend', 'reviews.moderate', 'feedback.manage',
      'announcements.manage', 'changelog.manage', 'settings.manage', 'access.manage', 'audit.read']
    when 'admin' then array[
      'admin.access', 'analytics.read', 'users.read', 'users.suspend', 'reviews.moderate', 'feedback.manage',
      'announcements.manage', 'changelog.manage']
    when 'moderator' then array['admin.access', 'reviews.moderate']
      || case when p_moderators_handle_feedback then array['feedback.manage'] else '{}'::text[] end
    else '{}'::text[]
  end
$$;

-- The actor's role, if the actor may do this; otherwise an error. Called
-- first by every admin function, whatever the app already checked.
create or replace function public.platform_assert(p_actor uuid, p_permission text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text;
begin
  if p_actor is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  select m.role into r
    from public.platform_admin_memberships m
    join auth.users u on u.id = m.user_id
   where m.user_id = p_actor and (u.banned_until is null or u.banned_until <= now());
  if r is null then
    raise exception 'platform:forbidden' using detail = 'This account has no Admin Center role.';
  end if;
  if not (p_permission = any (public.platform_permissions(
      r, coalesce((public.platform_settings_current() ->> 'moderators_handle_feedback')::boolean, false)))) then
    raise exception 'platform:forbidden' using detail = 'Your role doesn''t include this.';
  end if;
  return r;
end
$$;

create or replace function public.platform_audit(
  p_actor uuid, p_role text, p_action text, p_target_type text, p_target_id text,
  p_reason text default null, p_metadata jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_admin_audit_log (actor_id, actor_role, action, target_type, target_id, reason, metadata)
  values (p_actor, p_role, p_action, p_target_type, p_target_id,
          left(nullif(btrim(p_reason), ''), 500), coalesce(p_metadata, '{}'::jsonb));
$$;

-- Text without control characters (newlines and tabs kept), trimmed; empty is null.
create or replace function public.platform_clean(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce(p, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '')
$$;

-- "2026-11-19" or an ISO timestamp as a date; anything else is null.
create or replace function public.platform_safe_date(p text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return left(p, 10)::date;
exception when others then
  return null;
end
$$;

-- Account metadata an administrator may see. Nothing from the account's data.
create or replace function public.platform_account_brief(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'createdAt', u.created_at,
    'lastSignInAt', u.last_sign_in_at,
    'emailConfirmedAt', u.email_confirmed_at,
    'bannedUntil', u.banned_until,
    'suspended', coalesce(u.banned_until > now(), false),
    'role', (select m.role from public.platform_admin_memberships m where m.user_id = u.id)
  )
  from auth.users u where u.id = p_user
$$;

-- How long and how often an account has used the app, from the dates of
-- its own records: journal days with study hours, Life Dashboard entries,
-- revision passes, habit check-ins, mocks and completed Roadmap activities.
-- Only dates from the account's creation to today count, so a backdated
-- record can't make an account look older. Never reads the Personal Diary
-- or any text. Internal: reached only through platform_my_review and
-- platform_submit_review, for the caller's own account.
create or replace function public.platform_usage_summary(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select coalesce(c.data, '{}'::jsonb) as d from public.chronicle_state c where c.user_id = p_user
  ),
  acct as (
    select (u.created_at at time zone 'utc')::date as created from auth.users u where u.id = p_user
  ),
  arr as (
    select k, case when jsonb_typeof(s.d -> k) = 'array' then s.d -> k else '[]'::jsonb end as items
      from s, unnest(array['journal', 'lifeLog', 'revisions', 'habits', 'mocks', 'plans']) as k
  ),
  days as (
    select 'journal' as feature, public.platform_safe_date(e ->> 'date') as day
      from arr, jsonb_array_elements(arr.items) e
     where arr.k = 'journal' and jsonb_typeof(e -> 'totalHours') = 'number' and (e ->> 'totalHours')::numeric > 0
    union all
    select 'life', public.platform_safe_date(e ->> 'date') from arr, jsonb_array_elements(arr.items) e where arr.k = 'lifeLog'
    union all
    select 'revision', public.platform_safe_date(p #>> '{}')
      from arr, jsonb_array_elements(arr.items) r,
           jsonb_array_elements(case when jsonb_typeof(r -> 'passes') = 'array' then r -> 'passes' else '[]'::jsonb end) p
     where arr.k = 'revisions'
    union all
    select 'revision', public.platform_safe_date(r ->> 'lastRevised') from arr, jsonb_array_elements(arr.items) r where arr.k = 'revisions'
    union all
    select 'habits', public.platform_safe_date(l.key)
      from arr, jsonb_array_elements(arr.items) h,
           jsonb_each(case when jsonb_typeof(h -> 'log') = 'object' then h -> 'log' else '{}'::jsonb end) l
     where arr.k = 'habits' and l.value = 'true'::jsonb
    union all
    select 'mocks', public.platform_safe_date(e ->> 'date') from arr, jsonb_array_elements(arr.items) e where arr.k = 'mocks'
    union all
    select 'roadmap', public.platform_safe_date(i ->> 'completedAt')
      from arr, jsonb_array_elements(arr.items) p,
           jsonb_array_elements(case when jsonb_typeof(p -> 'items') = 'array' then p -> 'items' else '[]'::jsonb end) i
     where arr.k = 'plans' and i ->> 'kind' = 'activity' and i ->> 'status' = 'completed'
  ),
  valid as (
    select d.feature, d.day from days d, acct
     where d.day is not null and d.day >= acct.created and d.day <= current_date
  )
  select jsonb_build_object(
    'firstUseOn', (select min(day) from valid),
    'usageDays', (select count(distinct day) from valid),
    'daysSinceFirstUse', coalesce(current_date - (select min(day) from valid), 0),
    'features', coalesce((select jsonb_agg(distinct feature order by feature) from valid), '[]'::jsonb),
    'accountCreatedOn', (select created from acct),
    'measuredAt', now()
  )
$$;

-- 5. Admin functions (service role only) ────────────────────────────
-- Each starts with platform_assert(p_actor, <permission>).

-- The caller's role and permissions, for the API's own check. Null means
-- no Admin Center access (no role, or the account is suspended).
create or replace function public.platform_admin_whoami(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text;
begin
  select m.role into r
    from public.platform_admin_memberships m
    join auth.users u on u.id = m.user_id
   where m.user_id = p_user and (u.banned_until is null or u.banned_until <= now());
  if r is null then return null; end if;
  return jsonb_build_object(
    'role', r,
    'permissions', to_jsonb(public.platform_permissions(
      r, coalesce((public.platform_settings_current() ->> 'moderators_handle_feedback')::boolean, false))));
end
$$;

-- Days as a 30-day series, weeks as a 12-week series, for the charts.
create or replace function public.platform_daily_series(p_days date[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object('day', g.day, 'count', coalesce(c.n, 0)) order by g.day)
    from (select current_date - i as day from generate_series(0, 29) i) g
    left join (select d as day, count(*) as n from unnest(p_days) d group by d) c on c.day = g.day
$$;

create or replace function public.platform_weekly_series(p_times timestamptz[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object('week', g.week, 'count', coalesce(c.n, 0)) order by g.week)
    from (select (date_trunc('week', now())::date - 7 * i) as week from generate_series(0, 11) i) g
    left join (select date_trunc('week', t)::date as week, count(*) as n from unnest(p_times) t group by 1) c
      on c.week = g.week
$$;

-- The overview, in one call. Each section only for a role allowed to see it.
create or replace function public.platform_admin_overview(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'admin.access');
  perms text[] := public.platform_permissions(
    r, coalesce((public.platform_settings_current() ->> 'moderators_handle_feedback')::boolean, false));
  result jsonb := jsonb_build_object('role', r, 'generatedAt', now());
begin
  if 'analytics.read' = any (perms) then
    result := result || jsonb_build_object(
      'accounts', (select jsonb_build_object(
          'total', count(*),
          'new7', count(*) filter (where u.created_at > now() - interval '7 days'),
          'new30', count(*) filter (where u.created_at > now() - interval '30 days'),
          'signedIn7', count(*) filter (where u.last_sign_in_at > now() - interval '7 days'),
          'signedIn30', count(*) filter (where u.last_sign_in_at > now() - interval '30 days'),
          'unconfirmed', count(*) filter (where u.email_confirmed_at is null),
          'suspended', count(*) filter (where u.banned_until > now()))
        from auth.users u),
      'registrations', public.platform_daily_series(array(
        select (u.created_at at time zone 'utc')::date from auth.users u where u.created_at > now() - interval '31 days')));
  end if;
  if 'users.read' = any (perms) then
    result := result || jsonb_build_object('recentAccounts', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'email', x.email, 'createdAt', x.created_at) order by x.created_at desc)
        from (select u.id, u.email, u.created_at from auth.users u order by u.created_at desc limit 5) x), '[]'::jsonb));
  end if;
  if 'reviews.moderate' = any (perms) then
    result := result || jsonb_build_object('reviews', jsonb_build_object(
      'byStatus', coalesce((select jsonb_object_agg(s.status, s.n) from (
          select v.status, count(*) as n from public.platform_reviews v group by v.status) s), '{}'::jsonb),
      'ratings', (select jsonb_build_object('1', count(*) filter (where v.rating = 1), '2', count(*) filter (where v.rating = 2),
          '3', count(*) filter (where v.rating = 3), '4', count(*) filter (where v.rating = 4), '5', count(*) filter (where v.rating = 5))
        from public.platform_reviews v where v.status <> 'withdrawn'),
      'weekly', public.platform_weekly_series(array(
        select v.submitted_at from public.platform_reviews v where v.submitted_at > now() - interval '13 weeks')),
      'pending', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'rating', x.rating, 'displayName', x.display_name,
          'excerpt', left(x.body, 140), 'submittedAt', x.submitted_at) order by x.submitted_at)
        from (select * from public.platform_reviews v where v.status = 'pending' order by v.submitted_at limit 5) x), '[]'::jsonb)));
  end if;
  if 'feedback.manage' = any (perms) then
    result := result || jsonb_build_object('feedback', jsonb_build_object(
      'byStatus', coalesce((select jsonb_object_agg(s.status, s.n) from (
          select f.status, count(*) as n from public.platform_feedback f group by f.status) s), '{}'::jsonb),
      'byCategory', coalesce((select jsonb_object_agg(s.category, s.n) from (
          select f.category, count(*) as n from public.platform_feedback f group by f.category) s), '{}'::jsonb),
      'total', (select count(*) from public.platform_feedback),
      'resolved', (select count(*) from public.platform_feedback f where f.status in ('resolved', 'closed')),
      'weekly', public.platform_weekly_series(array(
        select f.created_at from public.platform_feedback f where f.created_at > now() - interval '13 weeks')),
      'recent', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'category', x.category, 'status', x.status,
          'excerpt', left(x.message, 140), 'createdAt', x.created_at) order by x.created_at desc)
        from (select * from public.platform_feedback f where f.status = 'new' order by f.created_at desc limit 5) x), '[]'::jsonb)));
  end if;
  if 'announcements.manage' = any (perms) then
    result := result || jsonb_build_object('announcements', jsonb_build_object(
      'draft', (select count(*) from public.platform_announcements a where a.status = 'draft'),
      'scheduled', (select count(*) from public.platform_announcements a where a.status = 'published' and a.starts_at > now()),
      'live', (select count(*) from public.platform_announcements a where a.status = 'published' and a.starts_at <= now()
                 and (a.ends_at is null or a.ends_at > now())),
      'upcoming', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'startsAt', x.starts_at) order by x.starts_at)
        from (select * from public.platform_announcements a where a.status = 'published' and a.starts_at > now()
               order by a.starts_at limit 5) x), '[]'::jsonb),
      'readership', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'startsAt', x.starts_at,
          'reads', (select count(*) from public.platform_announcement_reads rd where rd.announcement_id = x.id and rd.read_at is not null)))
        from (select * from public.platform_announcements a where a.status = 'published' and a.starts_at <= now()
               order by a.starts_at desc limit 5) x), '[]'::jsonb)));
  end if;
  if 'changelog.manage' = any (perms) then
    result := result || jsonb_build_object('changelog', jsonb_build_object(
      'published', (select count(*) from public.platform_changelog_entries c where c.status = 'published' and c.published_at <= now()),
      'drafts', (select count(*) from public.platform_changelog_entries c where c.status = 'draft'),
      'recent', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'slug', x.slug, 'title', x.title, 'publishedAt', x.published_at)
          order by x.published_at desc)
        from (select * from public.platform_changelog_entries c where c.status = 'published'
               order by c.published_at desc limit 5) x), '[]'::jsonb)));
  end if;
  if 'audit.read' = any (perms) then
    result := result || jsonb_build_object('recentActions', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'action', x.action, 'targetType', x.target_type, 'targetId', x.target_id,
          'actorEmail', (select u.email from auth.users u where u.id = x.actor_id), 'createdAt', x.created_at) order by x.id desc)
        from (select * from public.platform_admin_audit_log l order by l.id desc limit 8) x), '[]'::jsonb));
  end if;
  return result;
end
$$;

-- The audit entries about one thing, newest first, with the actors' emails.
create or replace function public.platform_history(p_target_type text, p_target_id text, p_limit int default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'action', l.action, 'reason', l.reason, 'metadata', l.metadata, 'createdAt', l.created_at,
      'actorRole', l.actor_role, 'actorEmail', (select u.email from auth.users u where u.id = l.actor_id))
    order by l.id desc), '[]'::jsonb)
  from (select * from public.platform_admin_audit_log a
         where a.target_type = p_target_type and a.target_id = p_target_id
         order by a.id desc limit greatest(1, least(coalesce(p_limit, 50), 200))) l
$$;

create or replace function public.platform_admin_list_users(
  p_actor uuid, p_search text default null, p_filter text default 'all', p_limit int default 25, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'users.read');
  q text := lower(public.platform_clean(p_search));
  lim int := greatest(1, least(coalesce(p_limit, 25), 100));
  off int := greatest(0, coalesce(p_offset, 0));
  pattern text;
  total int;
  items jsonb;
begin
  if p_filter is not null and p_filter not in ('all', 'suspended', 'unconfirmed', 'staff', 'recent') then
    raise exception 'platform:invalid' using detail = 'Unknown filter.';
  end if;
  pattern := '%' || replace(replace(replace(coalesce(q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  with f as (
    select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until, m.role
      from auth.users u left join public.platform_admin_memberships m on m.user_id = u.id
     where (q is null or lower(u.email) like pattern or u.id::text = q)
       and (coalesce(p_filter, 'all') = 'all'
         or (p_filter = 'suspended' and u.banned_until > now())
         or (p_filter = 'unconfirmed' and u.email_confirmed_at is null)
         or (p_filter = 'staff' and m.role is not null)
         or (p_filter = 'recent' and u.created_at > now() - interval '30 days'))
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'email', x.email, 'createdAt', x.created_at,
             'lastSignInAt', x.last_sign_in_at, 'emailConfirmedAt', x.email_confirmed_at, 'bannedUntil', x.banned_until,
             'suspended', coalesce(x.banned_until > now(), false), 'role', x.role) order by x.created_at desc, x.id)
           from (select * from f order by f.created_at desc, f.id limit lim offset off) x), '[]'::jsonb)
    into total, items;
  return jsonb_build_object('total', total, 'limit', lim, 'offset', off, 'items', items);
end
$$;

-- One account: its metadata, what it sent the platform, and what
-- administrators did to it. Nothing from its chronicle.
create or replace function public.platform_admin_get_user(p_actor uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'users.read');
  brief jsonb := public.platform_account_brief(p_user);
begin
  if brief is null then
    raise exception 'platform:not_found' using detail = 'No account with that id.';
  end if;
  return brief || jsonb_build_object(
    'reviewStatus', (select v.status from public.platform_reviews v where v.user_id = p_user),
    'feedbackCount', (select count(*) from public.platform_feedback f where f.user_id = p_user),
    'history', public.platform_history('user', p_user::text, 50));
end
$$;

-- Whether this suspension or restoration may go ahead. Run before the app
-- asks Supabase Auth to change the account.
create or replace function public.platform_admin_account_check(p_actor uuid, p_user uuid, p_action text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'users.suspend');
  brief jsonb := public.platform_account_brief(p_user);
begin
  if p_action not in ('suspend', 'restore') then
    raise exception 'platform:invalid' using detail = 'Unknown action.';
  end if;
  if brief is null then
    raise exception 'platform:not_found' using detail = 'No account with that id.';
  end if;
  -- Rules, not bad input: refused as forbidden.
  if p_user = p_actor then
    raise exception 'platform:forbidden' using detail = 'You can''t suspend or restore your own account.';
  end if;
  if brief ->> 'role' is not null then
    raise exception 'platform:forbidden'
      using detail = 'This account has an Admin Center role. A Super Admin has to remove it first.';
  end if;
  if p_action = 'suspend' and (brief ->> 'suspended')::boolean then
    raise exception 'platform:conflict' using detail = 'This account is already suspended.';
  end if;
  if p_action = 'restore' and not (brief ->> 'suspended')::boolean then
    raise exception 'platform:conflict' using detail = 'This account isn''t suspended.';
  end if;
  return brief;
end
$$;

-- Records a suspension or restoration that Supabase Auth has just applied.
create or replace function public.platform_admin_account_record(
  p_actor uuid, p_user uuid, p_action text, p_reason text, p_until timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'users.suspend');
  why text := public.platform_clean(p_reason);
begin
  if p_action not in ('suspend', 'restore') then
    raise exception 'platform:invalid' using detail = 'Unknown action.';
  end if;
  if p_action = 'suspend' and (why is null or char_length(why) < 5) then
    raise exception 'platform:invalid' using detail = 'Give a reason of at least 5 characters.';
  end if;
  perform public.platform_audit(p_actor, r, case p_action when 'suspend' then 'user.suspended' else 'user.restored' end,
    'user', p_user::text, why, case when p_until is null then '{}'::jsonb else jsonb_build_object('until', p_until) end);
  return public.platform_account_brief(p_user);
end
$$;

-- A review as each audience may see it. The public shape never includes
-- suggestions, consent details, the account or the moderation trail.
create or replace function public.platform_review_json(v public.platform_reviews, p_for text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when v.id is null then null
    when p_for = 'public' then jsonb_build_object(
      'id', v.id, 'rating', v.rating, 'headline', v.headline, 'body', v.body, 'useful', v.useful,
      'features', to_jsonb(v.features), 'stage', v.stage, 'displayName', v.display_name,
      'publishedAt', v.published_at, 'response', v.response, 'responseAt', v.response_at)
    else jsonb_build_object(
      'id', v.id, 'rating', v.rating, 'headline', v.headline, 'body', v.body, 'useful', v.useful,
      'suggestions', v.suggestions, 'features', to_jsonb(v.features), 'stage', v.stage, 'displayName', v.display_name,
      'feedbackConsent', v.feedback_consent, 'feedbackConsentAt', v.feedback_consent_at,
      'publicConsent', v.public_consent, 'publicConsentAt', v.public_consent_at,
      'status', v.status, 'usage', v.usage, 'moderationReason', v.moderation_reason, 'moderatedAt', v.moderated_at,
      'response', v.response, 'responseAt', v.response_at, 'publishedAt', v.published_at,
      'submittedAt', v.submitted_at, 'updatedAt', v.updated_at, 'withdrawnAt', v.withdrawn_at)
      || case when p_for = 'admin' then jsonb_build_object(
           'userId', v.user_id,
           'account', (select jsonb_build_object('emailConfirmed', u.email_confirmed_at is not null, 'createdAt', u.created_at)
                         from auth.users u where u.id = v.user_id))
         else '{}'::jsonb end
  end
$$;

create or replace function public.platform_admin_list_reviews(
  p_actor uuid, p_status text default 'pending', p_limit int default 20, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'reviews.moderate');
  lim int := greatest(1, least(coalesce(p_limit, 20), 100));
  off int := greatest(0, coalesce(p_offset, 0));
begin
  if coalesce(p_status, 'all') not in ('all', 'pending', 'approved', 'rejected', 'published', 'hidden', 'withdrawn') then
    raise exception 'platform:invalid' using detail = 'Unknown status.';
  end if;
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(s.status, s.n) from (
        select v.status, count(*) as n from public.platform_reviews v group by v.status) s), '{}'::jsonb),
    'total', (select count(*) from public.platform_reviews v where coalesce(p_status, 'all') in ('all', v.status)),
    'limit', lim, 'offset', off,
    'items', coalesce((select jsonb_agg(public.platform_review_json(x.v, 'admin') order by (x.v).submitted_at desc)
      from (select v from public.platform_reviews v where coalesce(p_status, 'all') in ('all', v.status)
             order by v.submitted_at desc limit lim offset off) x), '[]'::jsonb));
end
$$;

create or replace function public.platform_admin_get_review(p_actor uuid, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'reviews.moderate');
  v public.platform_reviews;
begin
  select * into v from public.platform_reviews where id = p_id;
  if v.id is null then
    raise exception 'platform:not_found' using detail = 'No review with that id.';
  end if;
  return public.platform_review_json(v, 'admin') || jsonb_build_object('history', public.platform_history('review', p_id::text, 50));
end
$$;

-- publish  pending, approved, hidden or rejected → published (needs public consent)
-- approve  pending, rejected or hidden → approved (accepted, not on the site)
-- reject   pending or approved → rejected (reason required; the author sees it)
-- hide     published → hidden (reason required; the author sees it)
-- `p_seen` is the submission time the moderator was looking at: if the
-- author has edited since, nothing changes and the moderator reloads.
create or replace function public.platform_admin_moderate_review(
  p_actor uuid, p_id uuid, p_action text, p_reason text default null, p_seen timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'reviews.moderate');
  v public.platform_reviews;
  why text := public.platform_clean(p_reason);
  next_status text;
  prev text;
begin
  select * into v from public.platform_reviews where id = p_id for update;
  if v.id is null then
    raise exception 'platform:not_found' using detail = 'No review with that id.';
  end if;
  if p_seen is not null and date_trunc('milliseconds', p_seen) <> date_trunc('milliseconds', v.submitted_at) then
    raise exception 'platform:conflict' using detail = 'The author changed this review after you opened it. Reload to see the new version.';
  end if;
  next_status := case p_action when 'publish' then 'published' when 'approve' then 'approved'
                                when 'reject' then 'rejected' when 'hide' then 'hidden' end;
  if next_status is null then
    raise exception 'platform:invalid' using detail = 'Unknown action.';
  end if;
  if v.status = 'withdrawn' then
    raise exception 'platform:invalid' using detail = 'The author withdrew this review.';
  end if;
  if v.status = next_status then
    return public.platform_review_json(v, 'admin');
  end if;
  if (p_action = 'publish' and v.status not in ('pending', 'approved', 'hidden', 'rejected'))
     or (p_action = 'approve' and v.status not in ('pending', 'rejected', 'hidden'))
     or (p_action = 'reject' and v.status not in ('pending', 'approved'))
     or (p_action = 'hide' and v.status <> 'published') then
    raise exception 'platform:invalid' using detail = format('A %s review can''t be changed that way.', v.status);
  end if;
  if p_action = 'publish' and not v.public_consent then
    raise exception 'platform:invalid'
      using detail = 'The author hasn''t agreed to show it on the website. Approve it instead: it stays private.';
  end if;
  if p_action in ('reject', 'hide') and (why is null or char_length(why) < 5) then
    raise exception 'platform:invalid' using detail = 'Give a reason of at least 5 characters. The author will see it.';
  end if;

  prev := v.status;
  update public.platform_reviews
     set status = next_status,
         moderation_reason = case when p_action in ('reject', 'hide') then left(why, 500) else null end,
         moderated_by = p_actor,
         moderated_at = now(),
         published_at = case when next_status = 'published' then coalesce(published_at, now()) else published_at end
   where id = p_id
  returning * into v;

  perform public.platform_audit(p_actor, r, 'review.' || case p_action when 'publish' then 'published'
      when 'approve' then 'approved' when 'reject' then 'rejected' else 'hidden' end,
    'review', p_id::text, why, jsonb_build_object('from', prev, 'to', next_status, 'rating', v.rating));
  return public.platform_review_json(v, 'admin');
end
$$;

create or replace function public.platform_admin_respond_review(p_actor uuid, p_id uuid, p_response text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'reviews.moderate');
  text_in text := public.platform_clean(p_response);
  v public.platform_reviews;
begin
  if text_in is not null and char_length(text_in) > 1000 then
    raise exception 'platform:invalid' using detail = 'Keep the response under 1,000 characters.';
  end if;
  update public.platform_reviews
     set response = text_in, response_at = case when text_in is null then null else now() end
   where id = p_id
  returning * into v;
  if v.id is null then
    raise exception 'platform:not_found' using detail = 'No review with that id.';
  end if;
  perform public.platform_audit(p_actor, r, case when text_in is null then 'review.response_removed' else 'review.response_set' end,
    'review', p_id::text, null, '{}'::jsonb);
  return public.platform_review_json(v, 'admin');
end
$$;

-- Feedback as each audience may see it. The author never sees the priority
-- or the notes; the team sees the email only if the author shared it.
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
         'userId', f.user_id, 'priority', f.priority, 'context', f.context, 'shareEmail', f.share_email,
         'email', case when f.share_email then (select u.email from auth.users u where u.id = f.user_id) end,
         'screenshotPath', f.screenshot_path,
         'noteCount', (select count(*) from public.platform_feedback_notes n where n.feedback_id = f.id))
       else jsonb_build_object('responseSeen', f.response_seen_at is not null and f.response_seen_at >= f.response_at) end
  end
$$;

create or replace function public.platform_admin_list_feedback(
  p_actor uuid, p_filters jsonb default '{}'::jsonb, p_limit int default 25, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'feedback.manage');
  st text := coalesce(nullif(p_filters ->> 'status', ''), 'open');
  cat text := nullif(p_filters ->> 'category', '');
  pri text := nullif(p_filters ->> 'priority', '');
  q text := lower(public.platform_clean(p_filters ->> 'q'));
  lim int := greatest(1, least(coalesce(p_limit, 25), 100));
  off int := greatest(0, coalesce(p_offset, 0));
  total int;
  items jsonb;
begin
  if st not in ('open', 'all', 'new', 'under_review', 'planned', 'in_progress', 'resolved', 'closed') then
    raise exception 'platform:invalid' using detail = 'Unknown status.';
  end if;
  with x as (
    select f from public.platform_feedback f
     where (st = 'all' or (st = 'open' and f.status not in ('resolved', 'closed')) or f.status = st)
       and (cat is null or f.category = cat)
       and (pri is null or f.priority = pri)
       and (q is null or strpos(lower(f.message), q) > 0)
  )
  select (select count(*) from x),
         coalesce((select jsonb_agg(public.platform_feedback_json(y.f, 'admin') order by (y.f).created_at desc)
           from (select x.f from x order by (x.f).created_at desc limit lim offset off) y), '[]'::jsonb)
    into total, items;
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(s.status, s.n) from (
        select f.status, count(*) as n from public.platform_feedback f group by f.status) s), '{}'::jsonb),
    'total', total, 'limit', lim, 'offset', off, 'items', items);
end
$$;

create or replace function public.platform_admin_get_feedback(p_actor uuid, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'feedback.manage');
  f public.platform_feedback;
begin
  select * into f from public.platform_feedback where id = p_id;
  if f.id is null then
    raise exception 'platform:not_found' using detail = 'No feedback with that id.';
  end if;
  return public.platform_feedback_json(f, 'admin') || jsonb_build_object(
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'createdAt', n.created_at,
        'authorEmail', (select u.email from auth.users u where u.id = n.author_id)) order by n.created_at)
      from public.platform_feedback_notes n where n.feedback_id = p_id), '[]'::jsonb),
    'history', public.platform_history('feedback', p_id::text, 50));
end
$$;

-- Changes any of status, priority, category and the linked changelog entry
-- (`changelogEntryId`, null to unlink). Keys not given stay as they are.
create or replace function public.platform_admin_update_feedback(p_actor uuid, p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'feedback.manage');
  f public.platform_feedback;
  changes jsonb := '{}'::jsonb;
  st text; pri text; cat text; link uuid;
begin
  select * into f from public.platform_feedback where id = p_id for update;
  if f.id is null then
    raise exception 'platform:not_found' using detail = 'No feedback with that id.';
  end if;
  st := coalesce(p_patch ->> 'status', f.status);
  pri := coalesce(p_patch ->> 'priority', f.priority);
  cat := coalesce(p_patch ->> 'category', f.category);
  if st not in ('new', 'under_review', 'planned', 'in_progress', 'resolved', 'closed') then
    raise exception 'platform:invalid' using detail = 'Unknown status.';
  end if;
  if pri not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'platform:invalid' using detail = 'Unknown priority.';
  end if;
  if cat not in ('bug', 'feature', 'suggestion', 'usability', 'general') then
    raise exception 'platform:invalid' using detail = 'Unknown category.';
  end if;
  link := f.changelog_entry_id;
  if p_patch ? 'changelogEntryId' then
    link := nullif(p_patch ->> 'changelogEntryId', '')::uuid;
    if link is not null and not exists (select 1 from public.platform_changelog_entries c where c.id = link) then
      raise exception 'platform:invalid' using detail = 'No changelog entry with that id.';
    end if;
  end if;
  if st <> f.status then changes := changes || jsonb_build_object('status', jsonb_build_object('from', f.status, 'to', st)); end if;
  if pri <> f.priority then changes := changes || jsonb_build_object('priority', jsonb_build_object('from', f.priority, 'to', pri)); end if;
  if cat <> f.category then changes := changes || jsonb_build_object('category', jsonb_build_object('from', f.category, 'to', cat)); end if;
  if link is distinct from f.changelog_entry_id then changes := changes || jsonb_build_object('changelogEntryId', link); end if;
  if changes = '{}'::jsonb then
    return public.platform_feedback_json(f, 'admin');
  end if;
  update public.platform_feedback
     set status = st, priority = pri, category = cat, changelog_entry_id = link,
         resolved_at = case when st in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end
   where id = p_id
  returning * into f;
  perform public.platform_audit(p_actor, r, 'feedback.updated', 'feedback', p_id::text, null, changes);
  return public.platform_feedback_json(f, 'admin');
end
$$;

-- A private note. Its text stays out of the audit log.
create or replace function public.platform_admin_add_feedback_note(p_actor uuid, p_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'feedback.manage');
  note text := public.platform_clean(p_body);
begin
  if note is null or char_length(note) > 2000 then
    raise exception 'platform:invalid' using detail = 'Write a note of up to 2,000 characters.';
  end if;
  if not exists (select 1 from public.platform_feedback f where f.id = p_id) then
    raise exception 'platform:not_found' using detail = 'No feedback with that id.';
  end if;
  insert into public.platform_feedback_notes (feedback_id, author_id, body) values (p_id, p_actor, note);
  perform public.platform_audit(p_actor, r, 'feedback.note_added', 'feedback', p_id::text, null, '{}'::jsonb);
  return public.platform_admin_get_feedback(p_actor, p_id);
end
$$;

-- The reply the author reads in the app. Null removes it.
create or replace function public.platform_admin_respond_feedback(p_actor uuid, p_id uuid, p_response text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'feedback.manage');
  reply text := public.platform_clean(p_response);
  f public.platform_feedback;
begin
  if reply is not null and char_length(reply) > 2000 then
    raise exception 'platform:invalid' using detail = 'Keep the response under 2,000 characters.';
  end if;
  update public.platform_feedback
     set response = reply,
         response_at = case when reply is null then null else now() end,
         response_seen_at = null
   where id = p_id
  returning * into f;
  if f.id is null then
    raise exception 'platform:not_found' using detail = 'No feedback with that id.';
  end if;
  perform public.platform_audit(p_actor, r, case when reply is null then 'feedback.response_removed' else 'feedback.responded' end,
    'feedback', p_id::text, null, '{}'::jsonb);
  return public.platform_admin_get_feedback(p_actor, p_id);
end
$$;

create or replace function public.platform_announcement_json(a public.platform_announcements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when a.id is null then null else jsonb_build_object(
    'id', a.id, 'title', a.title, 'body', a.body, 'category', a.category, 'status', a.status,
    'state', case when a.status = 'draft' then 'draft' when a.status = 'archived' then 'archived'
                  when a.starts_at > now() then 'scheduled'
                  when a.ends_at is not null and a.ends_at <= now() then 'ended' else 'live' end,
    'startsAt', a.starts_at, 'endsAt', a.ends_at, 'publishedAt', a.published_at,
    'createdAt', a.created_at, 'updatedAt', a.updated_at,
    'reads', (select count(*) from public.platform_announcement_reads rd where rd.announcement_id = a.id and rd.read_at is not null),
    'dismissals', (select count(*) from public.platform_announcement_reads rd where rd.announcement_id = a.id and rd.dismissed_at is not null))
  end
$$;

create or replace function public.platform_admin_list_announcements(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'announcements.manage');
  s jsonb := public.platform_settings_current();
begin
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'defaults', jsonb_build_object('days', s -> 'announcement_default_days', 'category', s -> 'announcement_default_category'),
    'items', coalesce((select jsonb_agg(public.platform_announcement_json(x.a)
        order by case (x.a).status when 'draft' then 0 when 'published' then 1 else 2 end,
                 coalesce((x.a).starts_at, (x.a).updated_at) desc)
      from (select a from public.platform_announcements a order by a.updated_at desc limit 200) x), '[]'::jsonb));
end
$$;

-- Creates a draft (no id) or edits one: title, body, category, endsAt.
create or replace function public.platform_admin_save_announcement(p_actor uuid, p_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'announcements.manage');
  a public.platform_announcements;
  t text := public.platform_clean(p_fields ->> 'title');
  b text := public.platform_clean(p_fields ->> 'body');
  c text := coalesce(nullif(p_fields ->> 'category', ''), 'general');
  ends timestamptz := nullif(p_fields ->> 'endsAt', '')::timestamptz;
begin
  if t is null or char_length(t) not between 3 and 120 then
    raise exception 'platform:invalid' using detail = 'Give it a title of 3 to 120 characters.';
  end if;
  if b is null or char_length(b) > 4000 then
    raise exception 'platform:invalid' using detail = 'Write the announcement, up to 4,000 characters.';
  end if;
  if c not in ('product_update', 'new_feature', 'maintenance', 'important', 'general') then
    raise exception 'platform:invalid' using detail = 'Unknown category.';
  end if;
  if p_id is null then
    insert into public.platform_announcements (title, body, category, ends_at, created_by, updated_by)
    values (t, b, c, ends, p_actor, p_actor) returning * into a;
    perform public.platform_audit(p_actor, r, 'announcement.created', 'announcement', a.id::text, null, '{}'::jsonb);
    return public.platform_announcement_json(a);
  end if;
  select * into a from public.platform_announcements where id = p_id for update;
  if a.id is null then
    raise exception 'platform:not_found' using detail = 'No announcement with that id.';
  end if;
  if a.status = 'archived' then
    raise exception 'platform:invalid' using detail = 'Restore it before editing.';
  end if;
  if ends is not null and ends <= coalesce(a.starts_at, now()) then
    raise exception 'platform:invalid' using detail = 'The end has to come after the start.';
  end if;
  update public.platform_announcements
     set title = t, body = b, category = c, ends_at = ends, updated_by = p_actor
   where id = p_id returning * into a;
  perform public.platform_audit(p_actor, r, 'announcement.updated', 'announcement', p_id::text, null,
    jsonb_build_object('status', a.status));
  return public.platform_announcement_json(a);
end
$$;

-- publish   draft → published, from p_starts_at (a future time schedules it; none is now)
-- unpublish published → draft
-- archive   draft or published → archived (hidden everywhere)
-- restore   archived → draft
create or replace function public.platform_admin_announcement_action(
  p_actor uuid, p_id uuid, p_action text, p_starts_at timestamptz default null, p_ends_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'announcements.manage');
  a public.platform_announcements;
  starts timestamptz := greatest(coalesce(p_starts_at, now()), now());
  act text;
begin
  select * into a from public.platform_announcements where id = p_id for update;
  if a.id is null then
    raise exception 'platform:not_found' using detail = 'No announcement with that id.';
  end if;
  if p_action = 'publish' then
    if a.status <> 'draft' then
      raise exception 'platform:invalid' using detail = 'Only a draft can be published.';
    end if;
    if p_ends_at is not null and p_ends_at <= starts then
      raise exception 'platform:invalid' using detail = 'The end has to come after the start.';
    end if;
    update public.platform_announcements
       set status = 'published', starts_at = starts, ends_at = p_ends_at,
           published_by = p_actor, published_at = now(), updated_by = p_actor
     where id = p_id returning * into a;
    act := case when starts > now() then 'announcement.scheduled' else 'announcement.published' end;
  elsif p_action = 'unpublish' and a.status = 'published' then
    update public.platform_announcements set status = 'draft', starts_at = null, updated_by = p_actor
     where id = p_id returning * into a;
    act := 'announcement.unpublished';
  elsif p_action = 'archive' and a.status in ('draft', 'published') then
    update public.platform_announcements set status = 'archived', updated_by = p_actor where id = p_id returning * into a;
    act := 'announcement.archived';
  elsif p_action = 'restore' and a.status = 'archived' then
    update public.platform_announcements set status = 'draft', starts_at = null, updated_by = p_actor
     where id = p_id returning * into a;
    act := 'announcement.restored';
  else
    raise exception 'platform:invalid' using detail = format('A %s announcement can''t be changed that way.', a.status);
  end if;
  perform public.platform_audit(p_actor, r, act, 'announcement', p_id::text, null,
    jsonb_build_object('startsAt', a.starts_at, 'endsAt', a.ends_at));
  return public.platform_announcement_json(a);
end
$$;

-- Only a draft that was never published can be deleted; anything people
-- may have seen is archived instead.
create or replace function public.platform_admin_delete_announcement(p_actor uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'announcements.manage');
  a public.platform_announcements;
begin
  select * into a from public.platform_announcements where id = p_id for update;
  if a.id is null then
    raise exception 'platform:not_found' using detail = 'No announcement with that id.';
  end if;
  if a.status <> 'draft' or a.published_at is not null then
    raise exception 'platform:invalid' using detail = 'It has been published. Archive it instead.';
  end if;
  delete from public.platform_announcements where id = p_id;
  perform public.platform_audit(p_actor, r, 'announcement.deleted', 'announcement', p_id::text, null,
    jsonb_build_object('title', a.title));
  return jsonb_build_object('deleted', true);
end
$$;

-- 6. Changelog ───────────────────────────────────────────────────────

create or replace function public.platform_changelog_json(c public.platform_changelog_entries, p_for text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.id is null then null else jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'title', c.title, 'summary', c.summary, 'body', c.body, 'category', c.category,
    'featureKey', c.feature_key, 'imageUrl', c.image_url, 'imageAlt', c.image_alt,
    'seoTitle', c.seo_title, 'seoDescription', c.seo_description, 'publishedAt', c.published_at,
    'requests', (select count(*) from public.platform_feedback f where f.changelog_entry_id = c.id))
    || case when p_for = 'admin' then jsonb_build_object(
         'status', c.status,
         'state', case when c.status = 'draft' then 'draft' when c.published_at > now() then 'scheduled' else 'published' end,
         'createdAt', c.created_at, 'updatedAt', c.updated_at)
       else '{}'::jsonb end
  end
$$;

create or replace function public.platform_slug(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(btrim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), '-'), 80)
$$;

create or replace function public.platform_admin_list_changelog(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'changelog.manage');
begin
  return jsonb_build_object('items', coalesce((select jsonb_agg(public.platform_changelog_json(x.c, 'admin')
      order by case (x.c).status when 'draft' then 0 else 1 end, coalesce((x.c).published_at, (x.c).updated_at) desc)
    from (select c from public.platform_changelog_entries c order by c.updated_at desc limit 300) x), '[]'::jsonb));
end
$$;

-- Creates a draft (no id) or edits an entry. Editing a published entry
-- keeps it published; `publishedAt` can move its date.
create or replace function public.platform_admin_save_changelog(p_actor uuid, p_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'changelog.manage');
  c public.platform_changelog_entries;
  t text := public.platform_clean(p_fields ->> 'title');
  sl text := public.platform_slug(coalesce(nullif(p_fields ->> 'slug', ''), p_fields ->> 'title'));
  sm text := public.platform_clean(p_fields ->> 'summary');
  bd text := coalesce(public.platform_clean(p_fields ->> 'body'), '');
  cat text := p_fields ->> 'category';
begin
  if t is null or char_length(t) not between 3 and 120 then
    raise exception 'platform:invalid' using detail = 'Give it a title of 3 to 120 characters.';
  end if;
  if sl = '' then
    raise exception 'platform:invalid' using detail = 'The address needs letters or numbers.';
  end if;
  if sm is null or char_length(sm) not between 10 and 300 then
    raise exception 'platform:invalid' using detail = 'Write a summary of 10 to 300 characters.';
  end if;
  if cat is null or cat not in ('new_feature', 'improvement', 'bug_fix', 'performance', 'security') then
    raise exception 'platform:invalid' using detail = 'Choose a category.';
  end if;
  if exists (select 1 from public.platform_changelog_entries x where x.slug = sl and x.id is distinct from p_id) then
    raise exception 'platform:conflict' using detail = format('Another entry already uses /changelog/%s.', sl);
  end if;
  if p_id is null then
    insert into public.platform_changelog_entries (slug, title, summary, body, category, feature_key, image_url, image_alt,
      seo_title, seo_description, created_by, updated_by)
    values (sl, t, sm, bd, cat, nullif(p_fields ->> 'featureKey', ''), public.platform_clean(p_fields ->> 'imageUrl'),
      public.platform_clean(p_fields ->> 'imageAlt'), public.platform_clean(p_fields ->> 'seoTitle'),
      public.platform_clean(p_fields ->> 'seoDescription'), p_actor, p_actor)
    returning * into c;
    perform public.platform_audit(p_actor, r, 'changelog.created', 'changelog', c.id::text, null, jsonb_build_object('slug', sl));
    return public.platform_changelog_json(c, 'admin');
  end if;
  select * into c from public.platform_changelog_entries where id = p_id for update;
  if c.id is null then
    raise exception 'platform:not_found' using detail = 'No changelog entry with that id.';
  end if;
  update public.platform_changelog_entries
     set slug = sl, title = t, summary = sm, body = bd, category = cat,
         feature_key = nullif(p_fields ->> 'featureKey', ''),
         image_url = public.platform_clean(p_fields ->> 'imageUrl'),
         image_alt = public.platform_clean(p_fields ->> 'imageAlt'),
         seo_title = public.platform_clean(p_fields ->> 'seoTitle'),
         seo_description = public.platform_clean(p_fields ->> 'seoDescription'),
         published_at = case when status = 'published' and nullif(p_fields ->> 'publishedAt', '') is not null
                             then (p_fields ->> 'publishedAt')::timestamptz else published_at end,
         updated_by = p_actor
   where id = p_id returning * into c;
  perform public.platform_audit(p_actor, r, 'changelog.updated', 'changelog', p_id::text, null,
    jsonb_build_object('slug', sl, 'status', c.status));
  return public.platform_changelog_json(c, 'admin');
end
$$;

-- publish   draft → published on p_published_at (a future date schedules it; none is now)
-- unpublish published → draft
create or replace function public.platform_admin_changelog_action(
  p_actor uuid, p_id uuid, p_action text, p_published_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'changelog.manage');
  c public.platform_changelog_entries;
begin
  select * into c from public.platform_changelog_entries where id = p_id for update;
  if c.id is null then
    raise exception 'platform:not_found' using detail = 'No changelog entry with that id.';
  end if;
  if p_action = 'publish' and c.status = 'draft' then
    update public.platform_changelog_entries
       set status = 'published', published_at = coalesce(p_published_at, now()), updated_by = p_actor
     where id = p_id returning * into c;
    perform public.platform_audit(p_actor, r,
      case when c.published_at > now() then 'changelog.scheduled' else 'changelog.published' end,
      'changelog', p_id::text, null, jsonb_build_object('slug', c.slug, 'publishedAt', c.published_at));
  elsif p_action = 'unpublish' and c.status = 'published' then
    update public.platform_changelog_entries set status = 'draft', published_at = null, updated_by = p_actor
     where id = p_id returning * into c;
    perform public.platform_audit(p_actor, r, 'changelog.unpublished', 'changelog', p_id::text, null,
      jsonb_build_object('slug', c.slug));
  else
    raise exception 'platform:invalid' using detail = format('A %s entry can''t be changed that way.', c.status);
  end if;
  return public.platform_changelog_json(c, 'admin');
end
$$;

create or replace function public.platform_admin_delete_changelog(p_actor uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'changelog.manage');
  c public.platform_changelog_entries;
begin
  select * into c from public.platform_changelog_entries where id = p_id for update;
  if c.id is null then
    raise exception 'platform:not_found' using detail = 'No changelog entry with that id.';
  end if;
  if c.status <> 'draft' then
    raise exception 'platform:invalid' using detail = 'Unpublish it first.';
  end if;
  delete from public.platform_changelog_entries where id = p_id;
  perform public.platform_audit(p_actor, r, 'changelog.deleted', 'changelog', p_id::text, null,
    jsonb_build_object('slug', c.slug, 'title', c.title));
  return jsonb_build_object('deleted', true);
end
$$;

-- 7. Settings and access ──────────────────────────────────────────────

-- Null when the value is acceptable for the key; otherwise what's wrong.
create or replace function public.platform_setting_problem(p_key text, p_value jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  n numeric;
begin
  if p_key in ('reviews_open', 'testimonials_on_home', 'testimonials_on_feature_pages', 'moderators_handle_feedback') then
    return case when jsonb_typeof(p_value) = 'boolean' then null else 'Expected on or off.' end;
  end if;
  if p_key in ('review_min_days', 'review_min_usage_days', 'testimonials_home_count', 'announcement_default_days') then
    if jsonb_typeof(p_value) <> 'number' then return 'Expected a whole number.'; end if;
    n := (p_value #>> '{}')::numeric;
    if n <> trunc(n) then return 'Expected a whole number.'; end if;
    return case
      when p_key = 'review_min_days' and n not between 0 and 365 then 'Between 0 and 365 days.'
      when p_key = 'review_min_usage_days' and n not between 1 and 365 then 'Between 1 and 365 days.'
      when p_key = 'testimonials_home_count' and n not between 1 and 6 then 'Between 1 and 6 reviews.'
      when p_key = 'announcement_default_days' and n not between 1 and 90 then 'Between 1 and 90 days.'
      else null end;
  end if;
  if p_key = 'support_email' then
    if jsonb_typeof(p_value) <> 'string' then return 'Expected an email address.'; end if;
    return case when (p_value #>> '{}') = '' or ((p_value #>> '{}') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                     and char_length(p_value #>> '{}') <= 200) then null else 'That isn''t an email address.' end;
  end if;
  if p_key = 'announcement_default_category' then
    return case when (p_value #>> '{}') in ('product_update', 'new_feature', 'maintenance', 'important', 'general')
                     and jsonb_typeof(p_value) = 'string' then null else 'Unknown category.' end;
  end if;
  if p_key = 'app_notice' then
    if jsonb_typeof(p_value) <> 'object' or jsonb_typeof(p_value -> 'enabled') <> 'boolean'
       or jsonb_typeof(p_value -> 'message') <> 'string' or coalesce(p_value ->> 'tone', '') not in ('info', 'warning')
       or exists (select 1 from jsonb_object_keys(p_value) k where k not in ('enabled', 'message', 'tone')) then
      return 'Expected a notice with on or off, a message and a tone.';
    end if;
    if char_length(p_value ->> 'message') > 240 then return 'Keep the notice under 240 characters.'; end if;
    if (p_value ->> 'enabled')::boolean and char_length(btrim(p_value ->> 'message')) < 3 then
      return 'Write the notice before switching it on.';
    end if;
    return null;
  end if;
  return 'Unknown setting.';
end
$$;

create or replace function public.platform_admin_get_settings(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'settings.manage');
begin
  return jsonb_build_object(
    'values', public.platform_settings_current(),
    'defaults', public.platform_settings_defaults(),
    'changed', coalesce((select jsonb_object_agg(s.key, jsonb_build_object('at', s.updated_at,
        'by', (select u.email from auth.users u where u.id = s.updated_by))) from public.platform_settings s), '{}'::jsonb));
end
$$;

-- Saves the keys given, each checked; one audit entry per changed key.
create or replace function public.platform_admin_update_settings(p_actor uuid, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'settings.manage');
  cur jsonb := public.platform_settings_current();
  k text;
  v jsonb;
  problem text;
begin
  if jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'platform:invalid' using detail = 'Nothing to save.';
  end if;
  for k, v in select * from jsonb_each(p_values) loop
    problem := public.platform_setting_problem(k, v);
    if problem is not null then
      raise exception 'platform:invalid' using detail = format('%s: %s', k, problem);
    end if;
  end loop;
  for k, v in select * from jsonb_each(p_values) loop
    continue when cur -> k = v;
    insert into public.platform_settings (key, value, updated_by, updated_at) values (k, v, p_actor, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
    perform public.platform_audit(p_actor, r, 'setting.updated', 'setting', k, null,
      jsonb_build_object('from', cur -> k, 'to', v));
  end loop;
  return public.platform_admin_get_settings(p_actor);
end
$$;

create or replace function public.platform_admin_list_members(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'access.manage');
begin
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(public.platform_account_brief(m.user_id) || jsonb_build_object(
        'grantedAt', m.created_at, 'updatedAt', m.updated_at,
        'grantedByEmail', (select u.email from auth.users u where u.id = m.granted_by))
      order by case m.role when 'super_admin' then 0 when 'admin' then 1 else 2 end, m.created_at)
      from public.platform_admin_memberships m), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'reason', l.reason,
        'metadata', l.metadata, 'createdAt', l.created_at, 'targetId', l.target_id,
        'targetEmail', (select u.email from auth.users u where u.id::text = l.target_id),
        'actorEmail', (select u.email from auth.users u where u.id = l.actor_id)) order by l.id desc)
      from (select * from public.platform_admin_audit_log a where a.action like 'role.%' order by a.id desc limit 50) l), '[]'::jsonb));
end
$$;

-- An account by its exact email, to grant it a role.
create or replace function public.platform_admin_find_account(p_actor uuid, p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'access.manage');
  id uuid;
begin
  select u.id into id from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  return case when id is null then null else public.platform_account_brief(id) end;
end
$$;

-- Grants Admin or Moderator, or switches between them. Never Super Admin,
-- never one's own role, never a Super Admin's: those stay in the SQL Editor.
create or replace function public.platform_admin_set_role(p_actor uuid, p_user uuid, p_role text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'access.manage');
  current_role_of text;
begin
  if p_role is null or p_role not in ('admin', 'moderator') then
    raise exception 'platform:invalid'
      using detail = 'Only Admin or Moderator can be granted here. Super Admin is added in the Supabase SQL Editor.';
  end if;
  if p_user = p_actor then
    raise exception 'platform:forbidden' using detail = 'You can''t change your own role.';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'platform:not_found' using detail = 'No account with that id.';
  end if;
  select m.role into current_role_of from public.platform_admin_memberships m where m.user_id = p_user for update;
  if current_role_of = 'super_admin' then
    raise exception 'platform:forbidden' using detail = 'A Super Admin''s role is only changed in the Supabase SQL Editor.';
  end if;
  if current_role_of is distinct from p_role then
    perform set_config('platform.actor', p_actor::text, true);
    perform set_config('platform.reason', coalesce(left(public.platform_clean(p_reason), 500), ''), true);
    insert into public.platform_admin_memberships (user_id, role, granted_by) values (p_user, p_role, p_actor)
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
    perform set_config('platform.actor', '', true);
    perform set_config('platform.reason', '', true);
  end if;
  return public.platform_account_brief(p_user);
end
$$;

create or replace function public.platform_admin_revoke_role(p_actor uuid, p_user uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'access.manage');
  current_role_of text;
begin
  if p_user = p_actor then
    raise exception 'platform:forbidden' using detail = 'You can''t remove your own role.';
  end if;
  select m.role into current_role_of from public.platform_admin_memberships m where m.user_id = p_user for update;
  if current_role_of is null then
    raise exception 'platform:not_found' using detail = 'That account has no Admin Center role.';
  end if;
  if current_role_of = 'super_admin' then
    raise exception 'platform:forbidden' using detail = 'A Super Admin''s role is only changed in the Supabase SQL Editor.';
  end if;
  perform set_config('platform.actor', p_actor::text, true);
  perform set_config('platform.reason', coalesce(left(public.platform_clean(p_reason), 500), ''), true);
  delete from public.platform_admin_memberships where user_id = p_user;
  perform set_config('platform.actor', '', true);
  perform set_config('platform.reason', '', true);
  return public.platform_account_brief(p_user);
end
$$;

-- The audit log, newest first, filtered by action prefix ("review."),
-- target or actor. `p_before` is the last id of the previous page.
create or replace function public.platform_admin_audit(
  p_actor uuid, p_filters jsonb default '{}'::jsonb, p_limit int default 50, p_before bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'audit.read');
  pre text := nullif(p_filters ->> 'action', '');
  tt text := nullif(p_filters ->> 'targetType', '');
  tid text := nullif(p_filters ->> 'targetId', '');
  actor uuid := nullif(p_filters ->> 'actorId', '')::uuid;
  lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'action', l.action, 'targetType', l.target_type, 'targetId', l.target_id,
      'reason', l.reason, 'metadata', l.metadata, 'createdAt', l.created_at, 'actorId', l.actor_id, 'actorRole', l.actor_role,
      'actorEmail', (select u.email from auth.users u where u.id = l.actor_id),
      'targetLabel', case l.target_type
        when 'user' then (select u.email from auth.users u where u.id::text = l.target_id)
        when 'review' then (select 'Review by ' || v.display_name from public.platform_reviews v where v.id::text = l.target_id)
        when 'feedback' then (select initcap(f.category) || ': ' || left(f.message, 60) from public.platform_feedback f where f.id::text = l.target_id)
        when 'announcement' then (select a.title from public.platform_announcements a where a.id::text = l.target_id)
        when 'changelog' then (select c.title from public.platform_changelog_entries c where c.id::text = l.target_id)
        when 'setting' then l.target_id
      end) order by l.id desc), '[]'::jsonb)
    into items
    from (select * from public.platform_admin_audit_log a
           where (pre is null or a.action like pre || '%')
             and (tt is null or a.target_type = tt)
             and (tid is null or a.target_id = tid)
             and (actor is null or a.actor_id = actor)
             and (p_before is null or a.id < p_before)
           order by a.id desc limit lim) l;
  return jsonb_build_object('items', items, 'limit', lim);
end
$$;

-- 8. Signed-in users: always their own account ───────────────────────

create or replace function public.platform_my_role()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('role', m.role)
    from public.platform_admin_memberships m
    join auth.users u on u.id = m.user_id
   where m.user_id = auth.uid() and (u.banned_until is null or u.banned_until <= now())
$$;

create or replace function public.platform_review_eligibility(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb := public.platform_settings_current();
  u jsonb := public.platform_usage_summary(p_user);
  min_days int := (s ->> 'review_min_days')::int;
  min_use int := (s ->> 'review_min_usage_days')::int;
begin
  u := coalesce(u, jsonb_build_object('firstUseOn', null, 'usageDays', 0, 'daysSinceFirstUse', 0, 'features', '[]'::jsonb));
  return u || jsonb_build_object(
    'minDays', min_days, 'minUsageDays', min_use,
    'eligible', u ->> 'firstUseOn' is not null
                and (u ->> 'usageDays')::int >= min_use
                and (u ->> 'daysSinceFirstUse')::int >= min_days);
end
$$;

create or replace function public.platform_my_review()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.platform_reviews;
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  select * into v from public.platform_reviews where user_id = uid;
  return jsonb_build_object(
    'review', public.platform_review_json(v, 'author'),
    'eligibility', public.platform_review_eligibility(uid),
    'open', coalesce((public.platform_settings_current() ->> 'reviews_open')::boolean, true));
end
$$;

-- Submits the caller's review, or edits it. A new review needs the usage
-- the settings ask for. An edit to anything shown publicly sends the review
-- back to moderation, and off the website until a moderator looks again.
create or replace function public.platform_submit_review(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.platform_reviews;
  elig jsonb;
  in_rating int;
  in_headline text := public.platform_clean(p_fields ->> 'headline');
  in_body text := public.platform_clean(p_fields ->> 'body');
  in_useful text := public.platform_clean(p_fields ->> 'useful');
  in_suggestions text := public.platform_clean(p_fields ->> 'suggestions');
  in_stage text := nullif(p_fields ->> 'stage', '');
  in_name text := public.platform_clean(p_fields ->> 'displayName');
  in_public boolean := coalesce((p_fields ->> 'publicConsent')::boolean, false);
  in_features text[];
  allowed_features text[] := array['journal', 'subjects', 'revision', 'mocks', 'mistakes', 'goals', 'roadmap', 'habits', 'life',
                          'performanceReview', 'diary', 'coach', 'currentAffairs', 'library', 'heatmap', 'knowledgeGraph'];
  public_changed boolean;
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  if jsonb_typeof(p_fields -> 'rating') <> 'number' then
    raise exception 'platform:invalid' using detail = 'Choose a rating from 1 to 5 stars.';
  end if;
  in_rating := (p_fields ->> 'rating')::numeric::int;
  if in_rating not between 1 and 5 then
    raise exception 'platform:invalid' using detail = 'Choose a rating from 1 to 5 stars.';
  end if;
  if in_body is null or char_length(in_body) not between 30 and 1500 then
    raise exception 'platform:invalid' using detail = 'Write your review in 30 to 1,500 characters.';
  end if;
  if in_headline is not null and char_length(in_headline) not between 3 and 80 then
    raise exception 'platform:invalid' using detail = 'Keep the headline between 3 and 80 characters.';
  end if;
  if (in_useful is not null and char_length(in_useful) > 600) or (in_suggestions is not null and char_length(in_suggestions) > 1000) then
    raise exception 'platform:invalid' using detail = 'One of the answers is too long.';
  end if;
  if in_name is null or char_length(in_name) not between 2 and 40 then
    raise exception 'platform:invalid' using detail = 'Choose a name of 2 to 40 characters to show with it.';
  end if;
  if in_stage is not null and in_stage not in ('foundation', 'prelims', 'mains', 'interview', 'working', 'repeat') then
    raise exception 'platform:invalid' using detail = 'Unknown preparation stage.';
  end if;
  if coalesce((p_fields ->> 'feedbackConsent')::boolean, false) is not true then
    raise exception 'platform:invalid' using detail = 'Agree to the team reading your review to send it.';
  end if;
  in_features := array(
    select distinct f from jsonb_array_elements_text(
      case when jsonb_typeof(p_fields -> 'features') = 'array' then p_fields -> 'features' else '[]'::jsonb end) f
     order by f);
  if not in_features <@ allowed_features then
    raise exception 'platform:invalid' using detail = 'Unknown feature.';
  end if;

  select * into v from public.platform_reviews where user_id = uid for update;
  if v.id is null then
    if not coalesce((public.platform_settings_current() ->> 'reviews_open')::boolean, true) then
      raise exception 'platform:closed' using detail = 'Reviews aren''t open at the moment.';
    end if;
    elig := public.platform_review_eligibility(uid);
    if not (elig ->> 'eligible')::boolean then
      raise exception 'platform:not_eligible'
        using detail = format('Reviews open after %s days of use, on at least %s different days.',
                              elig ->> 'minDays', elig ->> 'minUsageDays');
    end if;
    insert into public.platform_reviews (user_id, rating, headline, body, useful, suggestions, features, stage, display_name,
      feedback_consent, feedback_consent_at, public_consent, public_consent_at, usage)
    values (uid, in_rating, in_headline, in_body, in_useful, in_suggestions, in_features, in_stage, in_name,
      true, now(), in_public, case when in_public then now() end, elig - 'eligible' - 'minDays' - 'minUsageDays')
    returning * into v;
    return public.platform_review_json(v, 'author');
  end if;

  public_changed := v.rating <> in_rating or v.headline is distinct from in_headline or v.body <> in_body
    or v.useful is distinct from in_useful or v.features <> in_features or v.stage is distinct from in_stage
    or v.display_name <> in_name;
  update public.platform_reviews
     set rating = in_rating, headline = in_headline, body = in_body, useful = in_useful, suggestions = in_suggestions,
         features = in_features, stage = in_stage, display_name = in_name,
         public_consent = in_public,
         public_consent_at = case when in_public then coalesce(public_consent_at, now()) end,
         usage = public.platform_review_eligibility(uid) - 'eligible' - 'minDays' - 'minUsageDays',
         -- Changes to what the public sees, a resubmission after withdrawing, or
         -- new consent to publish: back to a moderator. Otherwise the state holds,
         -- except that a published review loses its place once consent goes.
         status = case
           when public_changed or status = 'withdrawn' or (in_public and not public_consent and status = 'approved') then 'pending'
           when not in_public and status = 'published' then 'approved'
           else status end,
         submitted_at = case when public_changed or status = 'withdrawn' then now() else submitted_at end,
         published_at = case when public_changed or status = 'withdrawn' then null else published_at end,
         moderation_reason = case when public_changed or status = 'withdrawn' then null else moderation_reason end,
         withdrawn_at = null
   where id = v.id
  returning * into v;
  return public.platform_review_json(v, 'author');
end
$$;

-- Turns public display on or off. Off takes a published review off the
-- website at once; on sends an approved review back to a moderator.
create or replace function public.platform_set_review_consent(p_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.platform_reviews;
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  select * into v from public.platform_reviews where user_id = uid for update;
  if v.id is null or v.status = 'withdrawn' then
    raise exception 'platform:not_found' using detail = 'You have no review to change.';
  end if;
  update public.platform_reviews
     set public_consent = coalesce(p_public, false),
         public_consent_at = case when coalesce(p_public, false) then coalesce(public_consent_at, now()) end,
         status = case
           when not coalesce(p_public, false) and status = 'published' then 'approved'
           when coalesce(p_public, false) and not public_consent and status = 'approved' then 'pending'
           else status end
   where id = v.id
  returning * into v;
  return public.platform_review_json(v, 'author');
end
$$;

-- Withdraws the review: off the website, out of the moderation queue. It
-- can be sent again later, and goes back to a moderator then.
create or replace function public.platform_withdraw_review()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.platform_reviews;
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  update public.platform_reviews
     set status = 'withdrawn', public_consent = false, public_consent_at = null, withdrawn_at = now()
   where user_id = uid
  returning * into v;
  if v.id is null then
    raise exception 'platform:not_found' using detail = 'You have no review to withdraw.';
  end if;
  return public.platform_review_json(v, 'author');
end
$$;

-- Deletes the caller's review entirely. The audit log keeps only that
-- moderators acted on an id, never what it said.
create or replace function public.platform_delete_my_review()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  delete from public.platform_reviews where user_id = uid;
  return jsonb_build_object('deleted', found);
end
$$;

-- Stores feedback from the caller: at most 10 a day.
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
  in_share boolean := coalesce((p_fields ->> 'shareEmail')::boolean, false);
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
  values (uid, in_category, in_message, ctx, in_share)
  returning * into f;
  return public.platform_feedback_json(f, 'author') || jsonb_build_object(
    'userId', uid,
    'email', case when in_share then (select u.email from auth.users u where u.id = uid) end);
end
$$;

-- Records the screenshot the server stored for the caller's own feedback,
-- at <user id>/<feedback id>.<ext> in the private bucket.
create or replace function public.platform_attach_feedback_screenshot(p_id uuid, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  f public.platform_feedback;
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  if p_path is null or p_path !~ ('^' || uid::text || '/' || p_id::text || '\.(webp|png|jpg)$') then
    raise exception 'platform:invalid' using detail = 'That isn''t this message''s screenshot.';
  end if;
  update public.platform_feedback set screenshot_path = p_path
   where id = p_id and user_id = uid and screenshot_path is null
  returning * into f;
  if f.id is null then
    raise exception 'platform:not_found' using detail = 'No message of yours with that id, or it already has a screenshot.';
  end if;
  return public.platform_feedback_json(f, 'author');
end
$$;

create or replace function public.platform_my_feedback()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(public.platform_feedback_json(x.f, 'author')
      order by (x.f).created_at desc)
    from (select f from public.platform_feedback f where f.user_id = uid order by f.created_at desc limit 50) x), '[]'::jsonb));
end
$$;

-- Marks the team's responses as read.
create or replace function public.platform_mark_feedback_seen()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  update public.platform_feedback set response_seen_at = now()
   where user_id = uid and response is not null and (response_seen_at is null or response_seen_at < response_at);
  get diagnostics n = row_count;
  return jsonb_build_object('marked', n);
end
$$;

-- Published announcements that have started (newest 30), with the caller's
-- read and dismissed state, and the app-wide notice if one is on.
create or replace function public.platform_my_announcements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  notice jsonb := public.platform_settings_current() -> 'app_notice';
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  return jsonb_build_object(
    'notice', case when coalesce((notice ->> 'enabled')::boolean, false)
                   then jsonb_build_object('message', notice ->> 'message', 'tone', notice ->> 'tone') end,
    -- Answers from the team the person hasn't opened yet, so the app can say so.
    'unseenResponses', (select count(*) from public.platform_feedback f
                         where f.user_id = uid and f.response is not null
                           and (f.response_seen_at is null or f.response_seen_at < f.response_at)),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'body', a.body, 'category', a.category,
        'startsAt', a.starts_at, 'endsAt', a.ends_at,
        'active', a.ends_at is null or a.ends_at > now(),
        'readAt', rd.read_at, 'dismissedAt', rd.dismissed_at) order by a.starts_at desc)
      from (select * from public.platform_announcements x
             where x.status = 'published' and x.starts_at <= now()
             order by x.starts_at desc limit 30) a
      left join public.platform_announcement_reads rd on rd.announcement_id = a.id and rd.user_id = uid), '[]'::jsonb));
end
$$;

create or replace function public.platform_mark_announcement(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  if p_action not in ('read', 'dismiss') then
    raise exception 'platform:invalid' using detail = 'Unknown action.';
  end if;
  if not exists (select 1 from public.platform_announcements a
                  where a.id = p_id and a.status = 'published' and a.starts_at <= now()) then
    raise exception 'platform:not_found' using detail = 'No announcement with that id.';
  end if;
  insert into public.platform_announcement_reads (announcement_id, user_id, read_at, dismissed_at)
  values (p_id, uid, now(), case when p_action = 'dismiss' then now() end)
  on conflict (announcement_id, user_id) do update
    set read_at = coalesce(public.platform_announcement_reads.read_at, now()),
        dismissed_at = case when p_action = 'dismiss' then now() else public.platform_announcement_reads.dismissed_at end;
  return jsonb_build_object('ok', true);
end
$$;

-- Marks every announcement the person can see as read, in one call: what
-- opening the announcements page does.
create or replace function public.platform_mark_announcements_read()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  insert into public.platform_announcement_reads (announcement_id, user_id, read_at)
  select a.id, uid, now() from public.platform_announcements a
   where a.status = 'published' and a.starts_at <= now()
  on conflict (announcement_id, user_id) do update
    set read_at = coalesce(public.platform_announcement_reads.read_at, now())
    where public.platform_announcement_reads.read_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('marked', n);
end
$$;

-- For the app's account deletion: true when deleting this account would
-- leave the platform without a Super Admin.
create or replace function public.platform_admin_is_last_super_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admin_memberships m where m.user_id = p_user and m.role = 'super_admin')
     and not exists (select 1 from public.platform_admin_memberships m where m.user_id <> p_user and m.role = 'super_admin')
$$;

-- 9. Public: published content only ──────────────────────────────────

create or replace function public.platform_public_reviews(p_limit int default 24, p_offset int default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.platform_reviews v where v.status = 'published' and v.public_consent),
    'averageRating', (select round(avg(v.rating), 1) from public.platform_reviews v where v.status = 'published' and v.public_consent),
    'items', coalesce((select jsonb_agg(public.platform_review_json(x.v, 'public') order by (x.v).published_at desc)
      from (select v from public.platform_reviews v where v.status = 'published' and v.public_consent
             order by v.published_at desc
             limit greatest(1, least(coalesce(p_limit, 24), 60)) offset greatest(0, coalesce(p_offset, 0))) x), '[]'::jsonb))
$$;

-- The settings public pages need: the support address and testimonial display.
create or replace function public.platform_public_site()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'supportEmail', nullif(s ->> 'support_email', ''),
    -- So the reviews page states the rule actually in force.
    'reviewRules', jsonb_build_object('minDays', s -> 'review_min_days', 'minUsageDays', s -> 'review_min_usage_days'),
    'testimonials', jsonb_build_object(
      'onHome', s -> 'testimonials_on_home',
      'homeCount', s -> 'testimonials_home_count',
      'onFeaturePages', s -> 'testimonials_on_feature_pages'))
  from (select public.platform_settings_current() as s) x
$$;

create or replace function public.platform_public_changelog(p_limit int default 30, p_offset int default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.platform_changelog_entries c where c.status = 'published' and c.published_at <= now()),
    'items', coalesce((select jsonb_agg(public.platform_changelog_json(x.c, 'public') - 'body' order by (x.c).published_at desc)
      from (select c from public.platform_changelog_entries c where c.status = 'published' and c.published_at <= now()
             order by c.published_at desc
             limit greatest(1, least(coalesce(p_limit, 30), 100)) offset greatest(0, coalesce(p_offset, 0))) x), '[]'::jsonb))
$$;

create or replace function public.platform_public_changelog_entry(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.platform_changelog_json(c, 'public')
    from public.platform_changelog_entries c
   where c.slug = p_slug and c.status = 'published' and c.published_at <= now()
$$;

-- 10. Who may call what ──────────────────────────────────────────────
-- Everything named platform_* is first closed to everyone, then opened to
-- exactly one audience. Helpers and trigger functions stay closed.
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
    if f.proname like 'platform\_admin\_%' or f.proname = 'platform_permissions' then
      execute format('grant execute on function %s to service_role', f.sig);
    elsif f.proname in ('platform_my_role', 'platform_my_review', 'platform_submit_review', 'platform_set_review_consent',
                        'platform_withdraw_review', 'platform_delete_my_review', 'platform_submit_feedback',
                        'platform_attach_feedback_screenshot', 'platform_my_feedback', 'platform_mark_feedback_seen',
                        'platform_my_announcements', 'platform_mark_announcement',
                        'platform_mark_announcements_read') then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.proname like 'platform\_public\_%' then
      execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
    end if;
  end loop;
end
$$;
