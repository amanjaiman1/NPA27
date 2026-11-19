-- ════════════════════════════════════════════════════════════════
-- TRUST & REVIEWS
-- Extends the Admin Center (20261204120000_platform_admin.sql): richer
-- reviews with revision and consent history, a published snapshot,
-- verification worked out from records, the review invitation, two
-- permission switches, and changelog fields for "You asked, we improved".
-- No new role, settings, audit or review table: the existing ones grow.
-- Additive and safe to run twice. See docs/trust-review-architecture-audit.md.
-- ════════════════════════════════════════════════════════════════

-- 1. Reviews: the new answers, preferences, moderation details and the
--    version shown on the website ───────────────────────────────────

alter table public.platform_reviews add column if not exists problem_before text;
alter table public.platform_reviews add column if not exists change_note text;
alter table public.platform_reviews add column if not exists aspirant_type text;
alter table public.platform_reviews add column if not exists display_preference text not null default 'name';
alter table public.platform_reviews add column if not exists show_tenure boolean not null default false;
alter table public.platform_reviews add column if not exists consent_version text;
alter table public.platform_reviews add column if not exists source text not null default 'settings';
alter table public.platform_reviews add column if not exists moderation_code text;
alter table public.platform_reviews add column if not exists featured_at timestamptz;
alter table public.platform_reviews add column if not exists featured_by uuid;
alter table public.platform_reviews add column if not exists slug text;
-- Exactly what the website shows, frozen when a moderator publishes. Null = not on the site.
alter table public.platform_reviews add column if not exists public_version jsonb;

-- A private review needs no long text; a public one still needs 30 characters.
alter table public.platform_reviews alter column body drop not null;
alter table public.platform_reviews drop constraint if exists platform_reviews_body_check;
-- The Command Center joins the features a review can name: 17 now.
alter table public.platform_reviews drop constraint if exists platform_reviews_features_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_reviews_features_count') then
    alter table public.platform_reviews add constraint platform_reviews_features_count check (cardinality(features) <= 20);
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_reviews_body_length') then
    alter table public.platform_reviews add constraint platform_reviews_body_length
      check (body is null or char_length(body) between 1 and 1500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'platform_reviews_public_body') then
    alter table public.platform_reviews add constraint platform_reviews_public_body
      check (not public_consent or char_length(coalesce(body, '')) >= 30);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'platform_reviews_trust_fields') then
    alter table public.platform_reviews add constraint platform_reviews_trust_fields check (
      (problem_before is null or char_length(problem_before) <= 600)
      and (change_note is null or char_length(change_note) <= 800)
      and (aspirant_type is null or aspirant_type in ('full_time', 'working'))
      and display_preference in ('name', 'initials', 'anonymous')
      and (consent_version is null or char_length(consent_version) <= 20)
      and source in ('settings', 'invitation')
      and (moderation_code is null or moderation_code in
           ('spam', 'abuse', 'personal_info', 'impersonation', 'fraud', 'unrelated', 'illegal', 'policy'))
      and (slug is null or (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'))
      -- Only a consented review can be on the site.
      and (public_version is null or public_consent));
  end if;
end
$$;

create unique index if not exists platform_reviews_slug_idx on public.platform_reviews (slug) where slug is not null;
create index if not exists platform_reviews_live_idx on public.platform_reviews (published_at desc) where public_version is not null;

-- Earlier versions of a review, kept when its author changes what the site shows.
create table if not exists public.platform_review_revisions (
  id         bigint generated always as identity primary key,
  review_id  uuid not null references public.platform_reviews (id) on delete cascade,
  content    jsonb not null,
  -- The status the review had when this version was replaced.
  status     text not null,
  created_at timestamptz not null default now()
);
create index if not exists platform_review_revisions_review_idx on public.platform_review_revisions (review_id, id desc);

-- Every grant and withdrawal of either permission, with the wording's version.
-- Goes with the review if the author deletes it.
create table if not exists public.platform_review_consent_events (
  id              bigint generated always as identity primary key,
  review_id       uuid not null references public.platform_reviews (id) on delete cascade,
  kind            text not null
                  check (kind in ('feedback_granted', 'public_granted', 'public_withdrawn', 'review_withdrawn')),
  consent_version text check (consent_version is null or char_length(consent_version) <= 20),
  created_at      timestamptz not null default now()
);
create index if not exists platform_review_consent_review_idx on public.platform_review_consent_events (review_id, id);

-- "Later" and "No thanks" on the in-app invitation to review.
create table if not exists public.platform_review_invitations (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  postponed_until timestamptz,
  postpone_count  int not null default 0 check (postpone_count between 0 and 100),
  dismissed_at    timestamptz,
  updated_at      timestamptz not null default now()
);

-- Same rule as every platform table: RLS on, no policies, no direct access.
alter table public.platform_review_revisions enable row level security;
alter table public.platform_review_consent_events enable row level security;
alter table public.platform_review_invitations enable row level security;
revoke all on public.platform_review_revisions from anon, authenticated;
revoke all on public.platform_review_consent_events from anon, authenticated;
revoke all on public.platform_review_invitations from anon, authenticated;

-- 2. Changelog: what changed, why it matters, the feedback it answers,
--    and Accessibility as a category ─────────────────────────────────

alter table public.platform_changelog_entries add column if not exists what_changed text;
alter table public.platform_changelog_entries add column if not exists why_it_matters text;
-- The feedback theme in the team's words ("Study logged once shouldn't be entered again
-- in Habits"), never a student's message. Public only while real feedback is linked.
alter table public.platform_changelog_entries add column if not exists asked_theme text;
alter table public.platform_changelog_entries drop constraint if exists platform_changelog_entries_category_check;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_changelog_category') then
    alter table public.platform_changelog_entries add constraint platform_changelog_category
      check (category in ('new_feature', 'improvement', 'bug_fix', 'performance', 'accessibility', 'security'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'platform_changelog_trust_fields') then
    alter table public.platform_changelog_entries add constraint platform_changelog_trust_fields check (
      (what_changed is null or char_length(what_changed) <= 2000)
      and (why_it_matters is null or char_length(why_it_matters) <= 1000)
      and (asked_theme is null or char_length(asked_theme) between 5 and 200));
  end if;
end
$$;

-- 3. Settings: the same table, more keys ─────────────────────────────

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
    'review_invite_enabled', true,
    'review_edit_policy', 'keep_previous',
    'review_aggregate_min', 5,
    'review_story_min_chars', 600,
    'verified_active_usage_days', 15,
    'established_member_days', 90,
    'testimonials_on_home', true,
    'testimonials_home_count', 3,
    'testimonials_on_feature_pages', true,
    'moderators_handle_feedback', false,
    'moderators_hide_reviews', true,
    'admins_read_audit', false,
    'support_email', '',
    'announcement_default_days', 14,
    'announcement_default_category', 'general',
    'app_notice', jsonb_build_object('enabled', false, 'message', '', 'tone', 'info')
  )
$$;

create or replace function public.platform_setting_problem(p_key text, p_value jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  n numeric;
begin
  if p_key in ('reviews_open', 'review_invite_enabled', 'testimonials_on_home', 'testimonials_on_feature_pages',
               'moderators_handle_feedback', 'moderators_hide_reviews', 'admins_read_audit') then
    return case when jsonb_typeof(p_value) = 'boolean' then null else 'Expected on or off.' end;
  end if;
  if p_key in ('review_min_days', 'review_min_usage_days', 'testimonials_home_count', 'announcement_default_days',
               'review_aggregate_min', 'review_story_min_chars', 'verified_active_usage_days', 'established_member_days') then
    if jsonb_typeof(p_value) <> 'number' then return 'Expected a whole number.'; end if;
    n := (p_value #>> '{}')::numeric;
    if n <> trunc(n) then return 'Expected a whole number.'; end if;
    return case
      when p_key = 'review_min_days' and n not between 0 and 365 then 'Between 0 and 365 days.'
      when p_key = 'review_min_usage_days' and n not between 1 and 365 then 'Between 1 and 365 days.'
      when p_key = 'testimonials_home_count' and n not between 1 and 6 then 'Between 1 and 6 reviews.'
      when p_key = 'announcement_default_days' and n not between 1 and 90 then 'Between 1 and 90 days.'
      when p_key = 'review_aggregate_min' and n not between 1 and 50 then 'Between 1 and 50 reviews.'
      when p_key = 'review_story_min_chars' and n not between 200 and 3000 then 'Between 200 and 3000 characters.'
      when p_key = 'verified_active_usage_days' and n not between 1 and 365 then 'Between 1 and 365 days.'
      when p_key = 'established_member_days' and n not between 30 and 1095 then 'Between 30 and 1095 days.'
      else null end;
  end if;
  if p_key = 'review_edit_policy' then
    return case when jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') in ('keep_previous', 'remove_until_approved')
                then null else 'Unknown option.' end;
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

-- 4. Permissions: the same matrix, plus two switches in the settings ──
--    reviews.hide  hiding and restoring a published review: Super Admins and
--                  Admins always, Moderators while moderators_hide_reviews is on
--    audit.read    Admins too, while admins_read_audit is on
--    Same table as src/lib/platform/roles.ts, in the same order; the e2e
--    test compares the two for every combination of switches.

create or replace function public.platform_role_permissions(p_role text, p_flags jsonb default '{}'::jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'super_admin' then array[
      'admin.access', 'analytics.read', 'users.read', 'users.suspend', 'reviews.moderate', 'reviews.hide',
      'feedback.manage', 'announcements.manage', 'changelog.manage', 'settings.manage', 'access.manage', 'audit.read']
    when 'admin' then array[
      'admin.access', 'analytics.read', 'users.read', 'users.suspend', 'reviews.moderate', 'reviews.hide',
      'feedback.manage', 'announcements.manage', 'changelog.manage']
      || case when coalesce((p_flags ->> 'admins_read_audit')::boolean, false) then array['audit.read'] else '{}'::text[] end
    when 'moderator' then array['admin.access', 'reviews.moderate']
      || case when coalesce((p_flags ->> 'moderators_hide_reviews')::boolean, true) then array['reviews.hide'] else '{}'::text[] end
      || case when coalesce((p_flags ->> 'moderators_handle_feedback')::boolean, false) then array['feedback.manage'] else '{}'::text[] end
    else '{}'::text[]
  end
$$;

-- The switches as they stand now.
create or replace function public.platform_permission_flags()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'moderators_handle_feedback', coalesce((s ->> 'moderators_handle_feedback')::boolean, false),
    'moderators_hide_reviews', coalesce((s ->> 'moderators_hide_reviews')::boolean, true),
    'admins_read_audit', coalesce((s ->> 'admins_read_audit')::boolean, false))
  from (select public.platform_settings_current() as s) x
$$;

-- The original entry point, kept so platform_assert, whoami and the overview
-- (which pass the feedback switch) now also follow the two new switches.
create or replace function public.platform_permissions(p_role text, p_moderators_handle_feedback boolean default false)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select public.platform_role_permissions(p_role,
    public.platform_permission_flags() || jsonb_build_object('moderators_handle_feedback', coalesce(p_moderators_handle_feedback, false)))
$$;

-- 5. Reviews: names, verification, versions ──────────────────────────

-- The name shown with a review: as written, initials only, or none.
create or replace function public.platform_review_public_name(p_name text, p_pref text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_pref = 'anonymous' then 'A DoOrDie aspirant'
    when p_pref = 'initials' then coalesce((select string_agg(upper(left(w, 1)) || '.', ' ')
                                              from regexp_split_to_table(btrim(coalesce(p_name, '')), '\s+') w
                                             where w <> ''), 'A DoOrDie aspirant')
    else p_name
  end
$$;

-- Verification, from the usage the database measured (never from what the
-- author or a moderator says). The answer names badges, never the counts.
--   verifiedUser    sent from a signed-in account that met the eligibility rule
--   activeUser      records on at least verified_active_usage_days days
--   features        the chosen features that the account has records in
--   established     the account is older than established_member_days, and
--                   the author chose to show it
create or replace function public.platform_review_badges(v public.platform_reviews)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'verifiedUser', true,
    'activeUser', coalesce((v.usage ->> 'usageDays')::int, 0) >= (s ->> 'verified_active_usage_days')::int,
    'features', coalesce((select jsonb_agg(f order by f) from unnest(v.features) f
                           where jsonb_typeof(v.usage -> 'features') = 'array' and (v.usage -> 'features') ? f), '[]'::jsonb),
    'established', v.show_tenure and coalesce((select u.created_at <= now() - make_interval(days => (s ->> 'established_member_days')::int)
                                                 from auth.users u where u.id = v.user_id), false))
  from (select public.platform_settings_current() as s) x
$$;

-- What the website shows of a review, frozen when it's published.
create or replace function public.platform_review_snapshot(v public.platform_reviews)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'rating', v.rating, 'headline', v.headline, 'body', v.body, 'useful', v.useful,
    'problemBefore', v.problem_before, 'changeNote', v.change_note,
    'features', to_jsonb(v.features), 'stage', v.stage, 'aspirantType', v.aspirant_type,
    'displayName', public.platform_review_public_name(v.display_name, v.display_preference),
    'badges', public.platform_review_badges(v))
$$;

-- Everything the author wrote and chose, for the revision history.
create or replace function public.platform_review_content(v public.platform_reviews)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'rating', v.rating, 'headline', v.headline, 'body', v.body, 'useful', v.useful, 'suggestions', v.suggestions,
    'problemBefore', v.problem_before, 'changeNote', v.change_note, 'features', to_jsonb(v.features),
    'stage', v.stage, 'aspirantType', v.aspirant_type, 'displayName', v.display_name,
    'displayPreference', v.display_preference, 'showTenure', v.show_tenure)
$$;

-- Long enough to deserve a page of its own: no thin pages for short reviews.
create or replace function public.platform_review_is_story(p_version jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_version is not null
     and char_length(concat_ws(' ', p_version ->> 'body', p_version ->> 'useful', p_version ->> 'problemBefore',
                               p_version ->> 'changeNote'))
         >= (public.platform_settings_current() ->> 'review_story_min_chars')::int
$$;

-- An address that stays put once given: the headline's words and a short
-- tag. Never the author's name, which may be anonymous.
create or replace function public.platform_review_slug(v public.platform_reviews)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws('-', nullif(left(public.platform_slug(coalesce(v.headline, '')), 60), ''), 'review',
                   left(md5(v.id::text), 8))
$$;

-- A live review as the public sees it: the frozen version, never ids,
-- emails, usage counts, suggestions or the moderation trail.
create or replace function public.platform_review_public(v public.platform_reviews)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when v.id is null or v.public_version is null or not v.public_consent then null else
    v.public_version || jsonb_build_object(
      'slug', v.slug, 'publishedAt', v.published_at, 'response', v.response, 'responseAt', v.response_at,
      'featured', v.featured_at is not null, 'story', public.platform_review_is_story(v.public_version))
  end
$$;

-- For the author and for moderators. 'admin' adds the account's safe facts.
create or replace function public.platform_review_json(v public.platform_reviews, p_for text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when v.id is null then null
    when p_for = 'public' then public.platform_review_public(v)
    else jsonb_build_object(
      'id', v.id, 'rating', v.rating, 'headline', v.headline, 'body', v.body, 'useful', v.useful,
      'suggestions', v.suggestions, 'problemBefore', v.problem_before, 'changeNote', v.change_note,
      'features', to_jsonb(v.features), 'stage', v.stage, 'aspirantType', v.aspirant_type,
      'displayName', v.display_name, 'displayPreference', v.display_preference, 'showTenure', v.show_tenure,
      'publicName', public.platform_review_public_name(v.display_name, v.display_preference),
      'feedbackConsent', v.feedback_consent, 'feedbackConsentAt', v.feedback_consent_at,
      'publicConsent', v.public_consent, 'publicConsentAt', v.public_consent_at, 'consentVersion', v.consent_version,
      'status', v.status, 'usage', v.usage, 'source', v.source,
      'moderationReason', v.moderation_reason, 'moderationCode', v.moderation_code, 'moderatedAt', v.moderated_at,
      'response', v.response, 'responseAt', v.response_at, 'publishedAt', v.published_at,
      'submittedAt', v.submitted_at, 'updatedAt', v.updated_at, 'withdrawnAt', v.withdrawn_at,
      'slug', v.slug, 'featuredAt', v.featured_at,
      'live', v.public_version is not null and v.public_consent, 'publicVersion', v.public_version,
      'badges', public.platform_review_badges(v))
      || case when p_for = 'admin' then jsonb_build_object(
           'userId', v.user_id,
           'account', (select jsonb_build_object('emailConfirmed', u.email_confirmed_at is not null, 'createdAt', u.created_at)
                         from auth.users u where u.id = v.user_id))
         else '{}'::jsonb end
  end
$$;

create or replace function public.platform_review_consent_event(p_review uuid, p_kind text, p_version text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_review_consent_events (review_id, kind, consent_version)
  values (p_review, p_kind, left(p_version, 20))
$$;

-- 6. Students: their own review only ─────────────────────────────────

-- Sends or edits the caller's review. A new review needs the usage the
-- settings ask for. Changing anything the site shows keeps the earlier
-- version in the revision history and sends the review back to a
-- moderator; under the 'keep_previous' policy the approved version stays
-- on the site meanwhile, otherwise it comes down until approved again.
create or replace function public.platform_submit_review(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s jsonb := public.platform_settings_current();
  v public.platform_reviews;
  old_row public.platform_reviews;
  elig jsonb;
  in_rating int;
  in_headline text := public.platform_clean(p_fields ->> 'headline');
  in_body text := public.platform_clean(p_fields ->> 'body');
  in_useful text := public.platform_clean(p_fields ->> 'useful');
  in_suggestions text := public.platform_clean(p_fields ->> 'suggestions');
  in_problem text := public.platform_clean(p_fields ->> 'problemBefore');
  in_change text := public.platform_clean(p_fields ->> 'changeNote');
  in_stage text := nullif(p_fields ->> 'stage', '');
  in_type text := nullif(p_fields ->> 'aspirantType', '');
  in_pref text := coalesce(nullif(p_fields ->> 'displayPreference', ''), 'name');
  in_tenure boolean := coalesce((p_fields ->> 'showTenure')::boolean, false);
  in_name text := public.platform_clean(p_fields ->> 'displayName');
  in_public boolean := coalesce((p_fields ->> 'publicConsent')::boolean, false);
  in_version text := left(public.platform_clean(p_fields ->> 'consentVersion'), 20);
  in_source text := case when p_fields ->> 'source' = 'invitation' then 'invitation' else 'settings' end;
  in_features text[];
  allowed_features text[] := array['dashboard', 'journal', 'subjects', 'revision', 'mocks', 'mistakes', 'goals', 'roadmap', 'habits', 'life',
                          'performanceReview', 'diary', 'coach', 'currentAffairs', 'library', 'heatmap', 'knowledgeGraph'];
  public_changed boolean;
  keep_live boolean;
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
  if in_body is not null and char_length(in_body) > 1500 then
    raise exception 'platform:invalid' using detail = 'Keep what you''d tell another aspirant under 1,500 characters.';
  end if;
  if in_public and char_length(coalesce(in_body, '')) < 30 then
    raise exception 'platform:invalid'
      using detail = 'A public testimonial needs at least 30 characters in what you''d tell another aspirant.';
  end if;
  if in_headline is not null and char_length(in_headline) not between 3 and 80 then
    raise exception 'platform:invalid' using detail = 'Keep the headline between 3 and 80 characters.';
  end if;
  if (in_useful is not null and char_length(in_useful) > 600) or (in_suggestions is not null and char_length(in_suggestions) > 1000)
     or (in_problem is not null and char_length(in_problem) > 600) or (in_change is not null and char_length(in_change) > 800) then
    raise exception 'platform:invalid' using detail = 'One of the answers is too long.';
  end if;
  if in_pref not in ('name', 'initials', 'anonymous') then
    raise exception 'platform:invalid' using detail = 'Choose how your name is shown.';
  end if;
  if in_pref = 'anonymous' then
    in_name := coalesce(in_name, 'Anonymous');
  end if;
  if in_name is null or char_length(in_name) not between 2 and 40 then
    raise exception 'platform:invalid' using detail = 'Choose a name of 2 to 40 characters to show with it.';
  end if;
  if in_stage is not null and in_stage not in ('foundation', 'prelims', 'mains', 'interview', 'working', 'repeat') then
    raise exception 'platform:invalid' using detail = 'Unknown preparation stage.';
  end if;
  if in_type is not null and in_type not in ('full_time', 'working') then
    raise exception 'platform:invalid' using detail = 'Unknown kind of preparation.';
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
    if not coalesce((s ->> 'reviews_open')::boolean, true) then
      raise exception 'platform:closed' using detail = 'Reviews aren''t open at the moment.';
    end if;
    elig := public.platform_review_eligibility(uid);
    if not (elig ->> 'eligible')::boolean then
      raise exception 'platform:not_eligible'
        using detail = format('Reviews open after %s days of use, on at least %s different days.',
                              elig ->> 'minDays', elig ->> 'minUsageDays');
    end if;
    insert into public.platform_reviews (user_id, rating, headline, body, useful, suggestions, problem_before, change_note,
      features, stage, aspirant_type, display_name, display_preference, show_tenure, feedback_consent, feedback_consent_at,
      public_consent, public_consent_at, consent_version, source, usage)
    values (uid, in_rating, in_headline, in_body, in_useful, in_suggestions, in_problem, in_change,
      in_features, in_stage, in_type, in_name, in_pref, in_tenure, true, now(),
      in_public, case when in_public then now() end, in_version, in_source, elig - 'eligible' - 'minDays' - 'minUsageDays')
    returning * into v;
    perform public.platform_review_consent_event(v.id, 'feedback_granted', in_version);
    if in_public then
      perform public.platform_review_consent_event(v.id, 'public_granted', in_version);
    end if;
    return public.platform_review_json(v, 'author');
  end if;

  old_row := v;
  public_changed := v.rating <> in_rating or v.headline is distinct from in_headline or v.body is distinct from in_body
    or v.useful is distinct from in_useful or v.problem_before is distinct from in_problem
    or v.change_note is distinct from in_change or v.features <> in_features or v.stage is distinct from in_stage
    or v.aspirant_type is distinct from in_type or v.display_name <> in_name or v.display_preference <> in_pref
    or v.show_tenure <> in_tenure;
  keep_live := public_changed and in_public and v.status <> 'withdrawn'
    and v.public_version is not null and v.public_consent and (s ->> 'review_edit_policy') = 'keep_previous';
  if public_changed or v.suggestions is distinct from in_suggestions then
    insert into public.platform_review_revisions (review_id, content, status)
    values (v.id, public.platform_review_content(v), v.status);
  end if;

  update public.platform_reviews
     set rating = in_rating, headline = in_headline, body = in_body, useful = in_useful, suggestions = in_suggestions,
         problem_before = in_problem, change_note = in_change, features = in_features, stage = in_stage,
         aspirant_type = in_type, display_name = in_name, display_preference = in_pref, show_tenure = in_tenure,
         feedback_consent = true,
         feedback_consent_at = case when status = 'withdrawn' then now() else feedback_consent_at end,
         public_consent = in_public,
         public_consent_at = case when in_public then coalesce(public_consent_at, now()) end,
         consent_version = coalesce(in_version, consent_version),
         usage = public.platform_review_eligibility(uid) - 'eligible' - 'minDays' - 'minUsageDays',
         status = case
           when public_changed or status = 'withdrawn' or (in_public and not public_consent and status = 'approved') then 'pending'
           when not in_public and status = 'published' then 'approved'
           else status end,
         -- The version on the site: gone without consent, kept or cleared on an edit by policy.
         public_version = case
           when not in_public or status = 'withdrawn' then null
           when public_changed and not keep_live then null
           else public_version end,
         featured_at = case when public_changed or not in_public then null else featured_at end,
         submitted_at = case when public_changed or status = 'withdrawn' then now() else submitted_at end,
         published_at = case when (public_changed and not keep_live) or status = 'withdrawn' or not in_public
                             then null else published_at end,
         moderation_reason = case when public_changed or status = 'withdrawn' then null else moderation_reason end,
         moderation_code = case when public_changed or status = 'withdrawn' then null else moderation_code end,
         withdrawn_at = null
   where id = v.id
  returning * into v;

  if old_row.status = 'withdrawn' then
    perform public.platform_review_consent_event(v.id, 'feedback_granted', in_version);
  end if;
  if in_public and not old_row.public_consent then
    perform public.platform_review_consent_event(v.id, 'public_granted', in_version);
  elsif not in_public and old_row.public_consent then
    perform public.platform_review_consent_event(v.id, 'public_withdrawn', in_version);
  end if;
  return public.platform_review_json(v, 'author');
end
$$;

-- Public display on or off. Off takes the review off the website at once,
-- with nobody's help; on sends an approved review back to a moderator.
-- Replaces the one-argument form: two forms would make calls ambiguous.
drop function if exists public.platform_set_review_consent(boolean);
create or replace function public.platform_set_review_consent(p_public boolean, p_version text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.platform_reviews;
  was_public boolean;
  on_now boolean := coalesce(p_public, false);
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  select * into v from public.platform_reviews where user_id = uid for update;
  if v.id is null or v.status = 'withdrawn' then
    raise exception 'platform:not_found' using detail = 'You have no review to change.';
  end if;
  if on_now and char_length(coalesce(v.body, '')) < 30 then
    raise exception 'platform:invalid'
      using detail = 'Add at least 30 characters to what you''d tell another aspirant before it can be public.';
  end if;
  was_public := v.public_consent;
  update public.platform_reviews
     set public_consent = on_now,
         public_consent_at = case when on_now then coalesce(public_consent_at, now()) end,
         consent_version = coalesce(left(public.platform_clean(p_version), 20), consent_version),
         status = case
           when not on_now and status = 'published' then 'approved'
           when on_now and not public_consent and status = 'approved' then 'pending'
           else status end,
         public_version = case when on_now then public_version end,
         featured_at = case when on_now then featured_at end,
         published_at = case when on_now then published_at end
   where id = v.id
  returning * into v;
  if on_now and not was_public then
    perform public.platform_review_consent_event(v.id, 'public_granted', p_version);
  elsif not on_now and was_public then
    perform public.platform_review_consent_event(v.id, 'public_withdrawn', p_version);
  end if;
  return public.platform_review_json(v, 'author');
end
$$;

-- Withdraws the review: off the website and out of the moderation queue
-- at once. It can be sent again later, and goes back to a moderator then.
create or replace function public.platform_withdraw_review()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.platform_reviews;
  was_public boolean;
begin
  if uid is null then
    raise exception 'platform:unauthorized' using detail = 'Sign in first.';
  end if;
  select * into v from public.platform_reviews where user_id = uid for update;
  if v.id is null then
    raise exception 'platform:not_found' using detail = 'You have no review to withdraw.';
  end if;
  was_public := v.public_consent;
  update public.platform_reviews
     set status = 'withdrawn', public_consent = false, public_consent_at = null, public_version = null,
         featured_at = null, published_at = null, withdrawn_at = now()
   where id = v.id
  returning * into v;
  if was_public then
    perform public.platform_review_consent_event(v.id, 'public_withdrawn', v.consent_version);
  end if;
  perform public.platform_review_consent_event(v.id, 'review_withdrawn', v.consent_version);
  return public.platform_review_json(v, 'author');
end
$$;

-- Whether to invite the caller to review: invitations on, reviews open, no
-- review yet, not dismissed or postponed, and genuinely eligible. Everyone
-- who qualifies is asked the same way, whatever their progress.
create or replace function public.platform_review_invite_due(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((s ->> 'review_invite_enabled')::boolean, true)
     and coalesce((s ->> 'reviews_open')::boolean, true)
     and not exists (select 1 from public.platform_reviews v where v.user_id = p_user)
     and not exists (select 1 from public.platform_review_invitations i where i.user_id = p_user
                      and (i.dismissed_at is not null or i.postponed_until > now()))
     and coalesce((public.platform_review_eligibility(p_user) ->> 'eligible')::boolean, false)
  from (select public.platform_settings_current() as s) x
$$;

-- "Later" asks again in 14 days; the third "later", or "no thanks", stops asking.
create or replace function public.platform_review_invite(p_action text)
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
  if p_action not in ('postpone', 'dismiss') then
    raise exception 'platform:invalid' using detail = 'Unknown action.';
  end if;
  insert into public.platform_review_invitations as i (user_id, postponed_until, postpone_count, dismissed_at)
  values (uid, case when p_action = 'postpone' then now() + interval '14 days' end,
          case when p_action = 'postpone' then 1 else 0 end, case when p_action = 'dismiss' then now() end)
  on conflict (user_id) do update
    set postponed_until = case when p_action = 'postpone' then now() + interval '14 days' else i.postponed_until end,
        postpone_count = i.postpone_count + case when p_action = 'postpone' then 1 else 0 end,
        dismissed_at = case when p_action = 'dismiss' or i.postpone_count + 1 >= 3 then coalesce(i.dismissed_at, now())
                            else i.dismissed_at end,
        updated_at = now();
  return jsonb_build_object('ok', true);
end
$$;

-- What the app asks for when it opens: exactly as the live-updates migration
-- (20261205120000) left it, with the clock and the next scheduled change,
-- plus whether to invite a review.
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
    'unseenResponses', (select count(*) from public.platform_feedback f
                         where f.user_id = uid and f.response is not null
                           and (f.response_seen_at is null or f.response_seen_at < f.response_at)),
    'reviewInvite', public.platform_review_invite_due(uid),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'body', a.body, 'category', a.category,
        'startsAt', a.starts_at, 'endsAt', a.ends_at,
        'active', a.ends_at is null or a.ends_at > now(),
        'readAt', rd.read_at, 'dismissedAt', rd.dismissed_at) order by a.starts_at desc)
      from (select * from public.platform_announcements x
             where x.status = 'published' and x.starts_at <= now()
             order by x.starts_at desc limit 30) a
      left join public.platform_announcement_reads rd on rd.announcement_id = a.id and rd.user_id = uid), '[]'::jsonb),
    -- The database's clock, so the app can time the next change without trusting its own.
    'now', now(),
    -- The next moment the list changes by itself: a scheduled start, or the end of a running one.
    'nextChangeAt', (select min(t) from (
        select x.starts_at as t from public.platform_announcements x
         where x.status = 'published' and x.starts_at > now()
        union all
        select x.ends_at from public.platform_announcements x
         where x.status = 'published' and x.starts_at <= now() and x.ends_at > now()
      ) upcoming));
end
$$;

-- 7. Moderation, in the Admin Center only ────────────────────────────

-- publish    pending, approved, hidden or rejected → published, with a fresh public version
-- approve    pending, rejected or hidden → approved: accepted, not on the site
-- reject     pending or approved → rejected, with a reason the author sees
-- hide       published → hidden, with a reason the author sees       (reviews.hide)
-- restore    hidden → published, with a fresh public version          (reviews.hide)
-- feature    a review on the site → featured on /reviews
-- unfeature  featured → not
-- Nothing here can change what the author wrote. `p_seen` is the submission
-- time the moderator was looking at: if the author edited since, nothing changes.
drop function if exists public.platform_admin_moderate_review(uuid, uuid, text, text, timestamptz);
create or replace function public.platform_admin_moderate_review(
  p_actor uuid, p_id uuid, p_action text, p_reason text default null, p_seen timestamptz default null,
  p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.platform_assert(p_actor, 'reviews.moderate');
  v public.platform_reviews;
  why text := left(public.platform_clean(p_reason), 500);
  next_status text;
  prev text;
  verb text;
begin
  if p_action in ('hide', 'restore') then
    perform public.platform_assert(p_actor, 'reviews.hide');
  end if;
  select * into v from public.platform_reviews where id = p_id for update;
  if v.id is null then
    raise exception 'platform:not_found' using detail = 'No review with that id.';
  end if;
  if p_seen is not null and date_trunc('milliseconds', p_seen) <> date_trunc('milliseconds', v.submitted_at) then
    raise exception 'platform:conflict' using detail = 'The author changed this review after you opened it. Reload to see the new version.';
  end if;
  if v.status = 'withdrawn' then
    raise exception 'platform:invalid' using detail = 'The author withdrew this review.';
  end if;

  if p_action in ('feature', 'unfeature') then
    if p_action = 'feature' and (v.public_version is null or not v.public_consent) then
      raise exception 'platform:invalid' using detail = 'Only a review on the website can be featured.';
    end if;
    update public.platform_reviews
       set featured_at = case when p_action = 'feature' then coalesce(featured_at, now()) end,
           featured_by = case when p_action = 'feature' then p_actor end
     where id = p_id returning * into v;
    perform public.platform_audit(p_actor, r, 'review.' || p_action || 'd', 'review', p_id::text, null,
      jsonb_build_object('rating', v.rating));
    return public.platform_review_json(v, 'admin');
  end if;

  next_status := case p_action when 'publish' then 'published' when 'restore' then 'published' when 'approve' then 'approved'
                                when 'reject' then 'rejected' when 'hide' then 'hidden' end;
  if next_status is null then
    raise exception 'platform:invalid' using detail = 'Unknown action.';
  end if;
  -- Already so: nothing to do, nothing to log.
  if v.status = next_status and ((v.public_version is not null) = (next_status = 'published')) then
    return public.platform_review_json(v, 'admin');
  end if;
  if (p_action = 'publish' and v.status not in ('pending', 'approved', 'hidden', 'rejected'))
     or (p_action = 'restore' and v.status <> 'hidden')
     or (p_action = 'approve' and v.status not in ('pending', 'rejected', 'hidden'))
     or (p_action = 'reject' and v.status not in ('pending', 'approved'))
     or (p_action = 'hide' and v.status <> 'published' and v.public_version is null) then
    raise exception 'platform:invalid' using detail = format('A %s review can''t be changed that way.', v.status);
  end if;
  if p_action in ('publish', 'restore') and not v.public_consent then
    raise exception 'platform:invalid'
      using detail = 'The author hasn''t agreed to show it on the website. Approve it instead: it stays private.';
  end if;
  if p_action in ('reject', 'hide') and (p_code is null or p_code not in
       ('spam', 'abuse', 'personal_info', 'impersonation', 'fraud', 'unrelated', 'illegal', 'policy')) then
    raise exception 'platform:invalid'
      using detail = 'Choose the reason: spam, abuse, personal details, impersonation, fraud, unrelated, illegal or another policy.';
  end if;

  prev := v.status;
  update public.platform_reviews
     set status = next_status,
         moderation_reason = case when p_action in ('reject', 'hide') then why end,
         moderation_code = case when p_action in ('reject', 'hide') then p_code end,
         moderated_by = p_actor,
         moderated_at = now(),
         slug = case when next_status = 'published' then coalesce(slug, public.platform_review_slug(v)) else slug end,
         published_at = case when next_status = 'published' then now() else null end,
         featured_at = case when next_status = 'published' then featured_at end
   where id = p_id
  returning * into v;
  -- The public version is written from the row as it is now, after the update.
  update public.platform_reviews
     set public_version = case when next_status = 'published' then public.platform_review_snapshot(v) end
   where id = p_id
  returning * into v;

  verb := case p_action when 'publish' then 'published' when 'restore' then 'restored' when 'approve' then 'approved'
                        when 'reject' then 'rejected' else 'hidden' end;
  perform public.platform_audit(p_actor, r, 'review.' || verb, 'review', p_id::text, why,
    jsonb_build_object('from', prev, 'to', next_status, 'rating', v.rating)
      || case when p_code is not null and p_action in ('reject', 'hide') then jsonb_build_object('code', p_code) else '{}'::jsonb end);
  return public.platform_review_json(v, 'admin');
end
$$;

-- The queue, with what the dashboard needs: counts by status and source,
-- the average of what's on the site, twelve weeks of volume, and the
-- latest moderation actions. All worked out from the rows themselves.
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
  st text := coalesce(p_status, 'all');
begin
  if st not in ('all', 'live', 'featured', 'pending', 'approved', 'rejected', 'published', 'hidden', 'withdrawn') then
    raise exception 'platform:invalid' using detail = 'Unknown status.';
  end if;
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(s.status, s.n) from (
        select v.status, count(*) as n from public.platform_reviews v group by v.status) s), '{}'::jsonb)
      || jsonb_build_object(
        'live', (select count(*) from public.platform_reviews v where v.public_version is not null and v.public_consent),
        'featured', (select count(*) from public.platform_reviews v
                      where v.featured_at is not null and v.public_version is not null and v.public_consent)),
    'stats', jsonb_build_object(
      'liveAverage', (select round(avg((v.public_version ->> 'rating')::numeric), 2) from public.platform_reviews v
                       where v.public_version is not null and v.public_consent),
      'bySource', coalesce((select jsonb_object_agg(s.source, s.n) from (
          select v.source, count(*) as n from public.platform_reviews v group by v.source) s), '{}'::jsonb),
      'weekly', (select jsonb_agg(jsonb_build_object('week', g.week, 'count', coalesce(c.n, 0)) order by g.week)
                   from (select (date_trunc('week', now()) - make_interval(weeks => i))::date as week
                           from generate_series(0, 11) i) g
                   left join (select date_trunc('week', v.submitted_at)::date as week, count(*) as n
                                from public.platform_reviews v group by 1) c on c.week = g.week),
      'activity', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'targetId', l.target_id,
            'createdAt', l.created_at, 'reason', l.reason, 'metadata', l.metadata,
            'actorEmail', (select u.email from auth.users u where u.id = l.actor_id)) order by l.id desc)
          from (select * from public.platform_admin_audit_log a where a.action like 'review.%' order by a.id desc limit 10) l),
          '[]'::jsonb)),
    'total', (select count(*) from public.platform_reviews v
               where st = 'all' or v.status = st
                  or (st = 'live' and v.public_version is not null and v.public_consent)
                  or (st = 'featured' and v.featured_at is not null and v.public_version is not null)),
    'limit', lim, 'offset', off,
    'items', coalesce((select jsonb_agg(public.platform_review_json(x.v, 'admin') order by (x.v).submitted_at desc)
      from (select v from public.platform_reviews v
             where st = 'all' or v.status = st
                or (st = 'live' and v.public_version is not null and v.public_consent)
                or (st = 'featured' and v.featured_at is not null and v.public_version is not null)
             order by v.submitted_at desc limit lim offset off) x), '[]'::jsonb));
end
$$;

-- One review for a moderator: the review, its verification evidence (the
-- usage the database measured), consent history, earlier versions and the
-- moderation trail. Never the author's records.
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
  return public.platform_review_json(v, 'admin') || jsonb_build_object(
    'history', public.platform_history('review', p_id::text, 50),
    'consentHistory', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'version', e.consent_version,
        'at', e.created_at) order by e.id) from public.platform_review_consent_events e where e.review_id = p_id), '[]'::jsonb),
    'revisions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'content', x.content, 'status', x.status,
        'at', x.created_at) order by x.id desc)
      from (select * from public.platform_review_revisions rv where rv.review_id = p_id order by rv.id desc limit 20) x), '[]'::jsonb),
    'verification', jsonb_build_object(
      'minDays', (public.platform_settings_current() ->> 'review_min_days')::int,
      'minUsageDays', (public.platform_settings_current() ->> 'review_min_usage_days')::int,
      'activeDays', (public.platform_settings_current() ->> 'verified_active_usage_days')::int,
      'establishedDays', (public.platform_settings_current() ->> 'established_member_days')::int));
end
$$;

-- 8. Public: live reviews only, as frozen when published ─────────────

-- Newest first, whatever the rating. The average, the distribution and
-- the per-feature counts appear only once there are enough reviews
-- (review_aggregate_min) for them to mean something.
create or replace function public.platform_public_reviews(p_limit int default 24, p_offset int default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select v.* from public.platform_reviews v where v.public_version is not null and v.public_consent
  ), agg as (
    select count(*) as total from live
  ), enough as (
    select (select total from agg) >= (public.platform_settings_current() ->> 'review_aggregate_min')::int as ok
  )
  select jsonb_build_object(
    'total', (select total from agg),
    'minForAggregate', (public.platform_settings_current() ->> 'review_aggregate_min')::int,
    'averageRating', case when (select ok from enough)
      then (select round(avg((l.public_version ->> 'rating')::numeric), 1) from live l) end,
    'distribution', case when (select ok from enough) then (select jsonb_build_object(
        '1', count(*) filter (where (l.public_version ->> 'rating')::int = 1),
        '2', count(*) filter (where (l.public_version ->> 'rating')::int = 2),
        '3', count(*) filter (where (l.public_version ->> 'rating')::int = 3),
        '4', count(*) filter (where (l.public_version ->> 'rating')::int = 4),
        '5', count(*) filter (where (l.public_version ->> 'rating')::int = 5)) from live l) end,
    'featureCounts', case when (select ok from enough) then coalesce((select jsonb_object_agg(f.k, f.n) from (
        select jsonb_array_elements_text(l.public_version -> 'features') as k, count(*) as n from live l group by 1) f),
      '{}'::jsonb) end,
    -- From the table itself, so each row keeps the platform_reviews type the helper takes.
    'items', coalesce((select jsonb_agg(public.platform_review_public(x.v) order by (x.v).published_at desc)
      from (select v from public.platform_reviews v where v.public_version is not null and v.public_consent
             order by v.published_at desc
             limit greatest(1, least(coalesce(p_limit, 24), 200)) offset greatest(0, coalesce(p_offset, 0))) x), '[]'::jsonb))
$$;

-- A single live review, for its own page.
create or replace function public.platform_public_review(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.platform_review_public(v)
    from public.platform_reviews v
   where v.slug = p_slug and v.public_version is not null and v.public_consent
$$;

-- The settings the public pages need, now including what the badges require.
create or replace function public.platform_public_site()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'supportEmail', nullif(s ->> 'support_email', ''),
    'reviewRules', jsonb_build_object('minDays', s -> 'review_min_days', 'minUsageDays', s -> 'review_min_usage_days'),
    'verification', jsonb_build_object('activeDays', s -> 'verified_active_usage_days',
                                       'establishedDays', s -> 'established_member_days'),
    'testimonials', jsonb_build_object(
      'onHome', s -> 'testimonials_on_home',
      'homeCount', s -> 'testimonials_home_count',
      'onFeaturePages', s -> 'testimonials_on_feature_pages'))
  from (select public.platform_settings_current() as s) x
$$;

-- 9. Changelog: the same entries, with what changed and why ──────────

-- The feedback theme is public only while real feedback is linked to the entry.
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
    'whatChanged', c.what_changed, 'whyItMatters', c.why_it_matters,
    'requests', q.n,
    'askedTheme', case when p_for = 'admin' or q.n > 0 then c.asked_theme end)
    || case when p_for = 'admin' then jsonb_build_object(
         'status', c.status,
         'state', case when c.status = 'draft' then 'draft' when c.published_at > now() then 'scheduled' else 'published' end,
         'createdAt', c.created_at, 'updatedAt', c.updated_at)
       else '{}'::jsonb end
  end
  from (select count(*) as n from public.platform_feedback f where f.changelog_entry_id = c.id) q
$$;

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
  wc text := public.platform_clean(p_fields ->> 'whatChanged');
  wm text := public.platform_clean(p_fields ->> 'whyItMatters');
  th text := public.platform_clean(p_fields ->> 'askedTheme');
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
  if cat is null or cat not in ('new_feature', 'improvement', 'bug_fix', 'performance', 'accessibility', 'security') then
    raise exception 'platform:invalid' using detail = 'Choose a category.';
  end if;
  if (wc is not null and char_length(wc) > 2000) or (wm is not null and char_length(wm) > 1000) then
    raise exception 'platform:invalid' using detail = 'Keep "What changed" under 2,000 and "Why it matters" under 1,000 characters.';
  end if;
  if th is not null and char_length(th) not between 5 and 200 then
    raise exception 'platform:invalid' using detail = 'Write the feedback theme in 5 to 200 characters.';
  end if;
  if exists (select 1 from public.platform_changelog_entries x where x.slug = sl and x.id is distinct from p_id) then
    raise exception 'platform:conflict' using detail = format('Another entry already uses /changelog/%s.', sl);
  end if;
  if p_id is null then
    insert into public.platform_changelog_entries (slug, title, summary, body, category, feature_key, image_url, image_alt,
      seo_title, seo_description, what_changed, why_it_matters, asked_theme, created_by, updated_by)
    values (sl, t, sm, bd, cat, nullif(p_fields ->> 'featureKey', ''), public.platform_clean(p_fields ->> 'imageUrl'),
      public.platform_clean(p_fields ->> 'imageAlt'), public.platform_clean(p_fields ->> 'seoTitle'),
      public.platform_clean(p_fields ->> 'seoDescription'), wc, wm, th, p_actor, p_actor)
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
         what_changed = wc, why_it_matters = wm, asked_theme = th,
         published_at = case when status = 'published' and nullif(p_fields ->> 'publishedAt', '') is not null
                             then (p_fields ->> 'publishedAt')::timestamptz else published_at end,
         updated_by = p_actor
   where id = p_id returning * into c;
  perform public.platform_audit(p_actor, r, 'changelog.updated', 'changelog', p_id::text, null,
    jsonb_build_object('slug', sl, 'status', c.status));
  return public.platform_changelog_json(c, 'admin');
end
$$;

-- "You asked. We improved.": published entries with a feedback theme and at
-- least one real piece of feedback linked to them. No sender, no message.
create or replace function public.platform_public_you_asked(p_limit int default 12)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', y.slug, 'title', y.title, 'askedTheme', y.asked_theme,
      'summary', y.summary, 'featureKey', y.feature_key, 'category', y.category, 'publishedAt', y.published_at,
      'requests', y.n) order by y.published_at desc), '[]'::jsonb)
  from (select x.* from (
          select c.*, (select count(*) from public.platform_feedback f where f.changelog_entry_id = c.id) as n
            from public.platform_changelog_entries c
           where c.status = 'published' and c.published_at <= now() and c.asked_theme is not null) x
         where x.n > 0
         order by x.published_at desc
         limit greatest(1, least(coalesce(p_limit, 12), 50))) y
$$;

-- 10. Reviews already on the site keep their place ───────────────────

update public.platform_reviews v
   set slug = public.platform_review_slug(v)
 where v.status = 'published' and v.public_consent and v.slug is null;
update public.platform_reviews v
   set public_version = public.platform_review_snapshot(v)
 where v.status = 'published' and v.public_consent and v.public_version is null;

-- 11. Who may call what ──────────────────────────────────────────────
-- The same rule as the Admin Center's migration, run again so the new and
-- replaced functions get exactly one audience. Helpers stay closed.
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
                        'platform_my_announcements', 'platform_mark_announcement', 'platform_mark_announcements_read',
                        'platform_review_invite') then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.proname like 'platform\_public\_%' then
      execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
    end if;
  end loop;
end
$$;
