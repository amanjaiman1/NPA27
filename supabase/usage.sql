-- ════════════════════════════════════════════════════════════════
-- How much of the free plan is in use
-- Read-only. Paste into the Supabase SQL Editor and run.
--
-- The Usage page (Dashboard → Organization → Usage) is the authority for
-- egress and monthly active users; these queries show where the database
-- space goes and how big each account's synced data has grown.
-- ════════════════════════════════════════════════════════════════

-- 1. Database size (Free plan: 500 MB).
select pg_size_pretty(pg_database_size(current_database())) as database_size;

-- 2. The app's tables, including indexes and TOAST (where large JSON lives).
select c.relname as table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('chronicle_state', 'chronicle_push_subscriptions', 'chronicle_push_log')
 order by pg_total_relation_size(c.oid) desc;

-- 3. Accounts, and how big each one's snapshot is. Every full download costs
--    about this much egress, so this is the number to watch as data grows.
select count(*) as accounts,
       pg_size_pretty(coalesce(sum(octet_length(data::text)), 0)) as all_snapshots,
       pg_size_pretty(coalesce(max(octet_length(data::text)), 0)::bigint) as largest_snapshot,
       pg_size_pretty(coalesce(avg(octet_length(data::text)), 0)::bigint) as average_snapshot
  from public.chronicle_state;

-- 4. The largest snapshots (no names or emails — just sizes and save counts).
select left(user_id::text, 8) || '…' as account,
       pg_size_pretty(octet_length(data::text)::bigint) as snapshot_size,
       version as saves,
       updated_at as last_saved
  from public.chronicle_state
 order by octet_length(data::text) desc
 limit 10;

-- 5. Sign-ups by month (Free plan: 50,000 monthly active users).
select date_trunc('month', created_at)::date as month, count(*) as new_accounts
  from auth.users
 group by 1
 order by 1 desc
 limit 12;

-- 6. Devices registered for background push.
select count(*) as devices, count(distinct user_id) as accounts_with_push
  from public.chronicle_push_subscriptions;
