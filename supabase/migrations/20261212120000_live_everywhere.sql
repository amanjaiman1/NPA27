-- Live updates everywhere
--
-- Every change someone else should see now reaches their open screens by
-- itself, whoever or whatever made it: a student, an administrator, Supabase
-- Auth (a sign-up, a sign-in, an email confirmed, a suspension) or SQL run in
-- the SQL Editor. Database triggers send one small message per change through
-- Supabase Realtime (Broadcast from the database, `realtime.send`), and each
-- open screen reloads what changed through the functions it already uses.
--
-- Three private channels, each with a receive-only policy on realtime.messages:
--
--   platform-updates         every signed-in account: announcements, the
--                            notice in the app, review settings, the changelog
--   platform-admin-updates   Admin Center roles only (platform_my_role()):
--                            accounts, reviews, feedback, announcements, the
--                            changelog, settings, access and the audit log
--   account:<user id>        that account only: its own synced data, its
--                            feedback and review, its announcements read
--                            state, its role, and its session (suspension or
--                            deletion)
--
-- A message names only the areas that changed (and, for synced data, the new
-- version number): never what changed, and never another account's id. There
-- are no insert policies, so nobody can send on these channels from a browser.
--
-- Sending never gets in the way of a change: the sender checks that Realtime
-- is there, sends at most once per channel and set of areas in a transaction,
-- and swallows any error. Where Realtime isn't installed, nothing is sent and
-- the apps load as they did before: when they open and when they come back.
--
-- The Admin API no longer sends messages itself (20261205120000_live_updates.sql
-- had it do so after its own changes); the database now does, for every change.
--
-- No new tables. Safe to run more than once.

-- 1. The sender ────────────────────────────────────────────────────────
create or replace function public.platform_live_send(p_topic text, p_areas text[], p_extra jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent text := coalesce(current_setting('platform.live_sent', true), '');
  item text := ';' || p_topic || '=' || array_to_string(p_areas, ',') || ';';
begin
  if p_topic is null or coalesce(cardinality(p_areas), 0) = 0 then
    return;
  end if;
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;
  end if;
  -- One change often writes several rows; the open screens need to hear about it once.
  if p_extra is null and position(item in sent) > 0 then
    return;
  end if;
  perform set_config('platform.live_sent', sent || item, true);
  execute 'select realtime.send($1, $2, $3, true)'
    using jsonb_build_object('areas', to_jsonb(p_areas)) || coalesce(p_extra, '{}'::jsonb), 'changed', p_topic;
exception when others then
  raise warning 'platform live update not sent: %', sqlerrm;
end
$$;

-- 2. What the triggers call ────────────────────────────────────────────
-- Every trigger below is per row, so a statement that changes nothing sends
-- nothing, and the sender's once-per-transaction rule turns a change to many
-- rows into one message.
--
-- Arguments in pairs: a channel, then the comma-separated areas for it.
create or replace function public.platform_live_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  for i in 0 .. tg_nargs - 1 by 2 loop
    perform public.platform_live_send(tg_argv[i], string_to_array(tg_argv[i + 1], ','));
  end loop;
  return null;
exception when others then
  return null;
end
$$;

-- The account a row belongs to hears about it: argument 0 names the column
-- holding the account's id, argument 1 the areas.
create or replace function public.platform_live_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_id text := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) ->> tg_argv[0] end;
  after_id text := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) ->> tg_argv[0] end;
  areas text[] := string_to_array(tg_argv[1], ',');
begin
  if after_id is not null then
    perform public.platform_live_send('account:' || after_id, areas);
  end if;
  if before_id is not null and before_id is distinct from after_id then
    perform public.platform_live_send('account:' || before_id, areas);
  end if;
  return null;
exception when others then
  return null;
end
$$;

-- Synced data: the account's other devices fetch it. The version lets the
-- device that saved it tell the message is about its own save.
create or replace function public.platform_live_chronicle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.platform_live_send('account:' || new.user_id::text, array['chronicle'], jsonb_build_object('version', new.version));
  return null;
exception when others then
  return null;
end
$$;

-- Accounts, from Supabase Auth. Never in the way of a sign-up or a sign-in.
create or replace function public.platform_live_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  perform public.platform_live_send('platform-admin-updates', array['users']);
  -- Suspended, restored or deleted: the account's open apps check their session.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.banned_until is distinct from new.banned_until) then
    perform public.platform_live_send('account:' || account::text, array['session']);
  end if;
  return null;
exception when others then
  return null;
end
$$;

revoke all on function public.platform_live_send(text, text[], jsonb) from public, anon, authenticated;
revoke all on function public.platform_live_notify() from public, anon, authenticated;
revoke all on function public.platform_live_owner() from public, anon, authenticated;
revoke all on function public.platform_live_chronicle() from public, anon, authenticated;
revoke all on function public.platform_live_auth_user() from public, anon, authenticated;

-- 3. Who may listen ────────────────────────────────────────────────────
-- (platform-updates is recreated here too, so this doesn't depend on 20261205120000.)
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'Realtime is not installed in this database: live updates are skipped.';
    return;
  end if;
  execute 'drop policy if exists "platform_updates_receive" on realtime.messages';
  execute $policy$
    create policy "platform_updates_receive"
      on realtime.messages
      for select
      to authenticated
      using ((select realtime.topic()) = 'platform-updates' and realtime.messages.extension in ('broadcast'))
  $policy$;
  execute 'drop policy if exists "platform_admin_updates_receive" on realtime.messages';
  execute $policy$
    create policy "platform_admin_updates_receive"
      on realtime.messages
      for select
      to authenticated
      using (
        (select realtime.topic()) = 'platform-admin-updates'
        and realtime.messages.extension in ('broadcast')
        and (select public.platform_my_role()) is not null
      )
  $policy$;
  execute 'drop policy if exists "account_updates_receive" on realtime.messages';
  execute $policy$
    create policy "account_updates_receive"
      on realtime.messages
      for select
      to authenticated
      using (
        (select realtime.topic()) = 'account:' || (select auth.uid())::text
        and realtime.messages.extension in ('broadcast')
      )
  $policy$;
end
$$;

-- 4. What sends ────────────────────────────────────────────────────────
-- Reviews: the Admin Center (Reviews, and the review shown in Users), and the author.
drop trigger if exists platform_live_reviews on public.platform_reviews;
create trigger platform_live_reviews after insert or update or delete on public.platform_reviews
  for each row execute function public.platform_live_notify('platform-admin-updates', 'reviews,users');
drop trigger if exists platform_live_reviews_owner on public.platform_reviews;
create trigger platform_live_reviews_owner after insert or update or delete on public.platform_reviews
  for each row execute function public.platform_live_owner('user_id', 'reviews');
-- Earlier versions and consent history are written with the review itself:
-- the same areas, so the transaction sends one message, not three.
drop trigger if exists platform_live_review_revisions on public.platform_review_revisions;
create trigger platform_live_review_revisions after insert or update or delete on public.platform_review_revisions
  for each row execute function public.platform_live_notify('platform-admin-updates', 'reviews,users');
drop trigger if exists platform_live_review_consents on public.platform_review_consent_events;
create trigger platform_live_review_consents after insert or update or delete on public.platform_review_consent_events
  for each row execute function public.platform_live_notify('platform-admin-updates', 'reviews,users');
-- The invitation to review, postponed or dismissed on one device, goes on the others.
drop trigger if exists platform_live_review_invitations on public.platform_review_invitations;
create trigger platform_live_review_invitations after insert or update or delete on public.platform_review_invitations
  for each row execute function public.platform_live_owner('user_id', 'reviews');

-- Feedback: the Feedback Center (and the count in Users), and the author.
drop trigger if exists platform_live_feedback on public.platform_feedback;
create trigger platform_live_feedback after insert or update or delete on public.platform_feedback
  for each row execute function public.platform_live_notify('platform-admin-updates', 'feedback,users');
drop trigger if exists platform_live_feedback_owner on public.platform_feedback;
create trigger platform_live_feedback_owner after insert or update or delete on public.platform_feedback
  for each row execute function public.platform_live_owner('user_id', 'feedback');
-- Private notes: the team only (the same areas as the feedback they're written with).
drop trigger if exists platform_live_feedback_notes on public.platform_feedback_notes;
create trigger platform_live_feedback_notes after insert or update or delete on public.platform_feedback_notes
  for each row execute function public.platform_live_notify('platform-admin-updates', 'feedback,users');

-- Announcements: every change for the Admin Center; for students, only what
-- touches a published one (drafts are nobody's business but the team's).
drop trigger if exists platform_live_announcements on public.platform_announcements;
create trigger platform_live_announcements after insert or update or delete on public.platform_announcements
  for each row execute function public.platform_live_notify('platform-admin-updates', 'announcements');
drop trigger if exists platform_live_announcements_published on public.platform_announcements;
create trigger platform_live_announcements_published after update on public.platform_announcements
  for each row when (old.status = 'published' or new.status = 'published')
  execute function public.platform_live_notify('platform-updates', 'announcements');
-- Opened or dismissed: the readership counts, and the reader's other devices.
drop trigger if exists platform_live_announcement_reads on public.platform_announcement_reads;
create trigger platform_live_announcement_reads after insert or update or delete on public.platform_announcement_reads
  for each row execute function public.platform_live_notify('platform-admin-updates', 'announcements');
drop trigger if exists platform_live_announcement_reads_owner on public.platform_announcement_reads;
create trigger platform_live_announcement_reads_owner after insert or update or delete on public.platform_announcement_reads
  for each row execute function public.platform_live_owner('user_id', 'announcements');

-- The changelog: the Admin Center; students when a published entry changes
-- (their answered feedback links to it).
drop trigger if exists platform_live_changelog on public.platform_changelog_entries;
create trigger platform_live_changelog after insert or update or delete on public.platform_changelog_entries
  for each row execute function public.platform_live_notify('platform-admin-updates', 'changelog');
drop trigger if exists platform_live_changelog_published on public.platform_changelog_entries;
create trigger platform_live_changelog_published after update on public.platform_changelog_entries
  for each row when (old.status = 'published' or new.status = 'published')
  execute function public.platform_live_notify('platform-updates', 'changelog');

-- Settings: the Admin Center (and its roles' extra permissions), and every
-- open app (the notice, and whether and when reviews are open).
drop trigger if exists platform_live_settings on public.platform_settings;
create trigger platform_live_settings after insert or update or delete on public.platform_settings
  for each row execute function public.platform_live_notify(
    'platform-admin-updates', 'settings,access', 'platform-updates', 'notice,reviews');

-- Roles: Admin access and Users, and the account whose role changed.
drop trigger if exists platform_live_memberships on public.platform_admin_memberships;
create trigger platform_live_memberships after insert or update or delete on public.platform_admin_memberships
  for each row execute function public.platform_live_notify('platform-admin-updates', 'access,users');
drop trigger if exists platform_live_memberships_owner on public.platform_admin_memberships;
create trigger platform_live_memberships_owner after insert or update or delete on public.platform_admin_memberships
  for each row execute function public.platform_live_owner('user_id', 'role');

-- The audit log.
drop trigger if exists platform_live_audit on public.platform_admin_audit_log;
create trigger platform_live_audit after insert on public.platform_admin_audit_log
  for each row execute function public.platform_live_notify('platform-admin-updates', 'audit');

-- Synced data: one message per save, to that account only.
drop trigger if exists platform_live_chronicle on public.chronicle_state;
create trigger platform_live_chronicle after insert or update on public.chronicle_state
  for each row execute function public.platform_live_chronicle();

-- Accounts: sign-ups, sign-ins, confirmations, suspensions, email changes and
-- deletions. Supabase allows triggers on auth.users; where a project doesn't,
-- the rest still works and Users updates when it's opened.
do $$
begin
  execute 'drop trigger if exists platform_live_users on auth.users';
  execute 'create trigger platform_live_users after insert or delete on auth.users
             for each row execute function public.platform_live_auth_user()';
  execute 'drop trigger if exists platform_live_users_changed on auth.users';
  execute 'create trigger platform_live_users_changed after update on auth.users
             for each row when (old.last_sign_in_at is distinct from new.last_sign_in_at
                             or old.email_confirmed_at is distinct from new.email_confirmed_at
                             or old.banned_until is distinct from new.banned_until
                             or old.email is distinct from new.email)
             execute function public.platform_live_auth_user()';
exception when insufficient_privilege then
  raise notice 'Triggers on auth.users are not allowed here: Users updates when it is opened.';
end
$$;
