-- ════════════════════════════════════════════════════════════════
-- A stand-in for Supabase Realtime's schema, for `npm run test:db` and the
-- local mock (scripts/mock-supabase.mjs): `realtime.messages` with row-level
-- security on, `realtime.topic()` and `realtime.send()`, shaped as Supabase
-- ships them, so the live-update policies and triggers run for real.
--
-- Never run this on a Supabase project: Realtime installs its own.
-- ════════════════════════════════════════════════════════════════

create schema if not exists realtime;

create table if not exists realtime.messages (
  id          bigserial primary key,
  topic       text not null,
  extension   text not null,
  payload     jsonb,
  event       text,
  private     boolean default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;

-- The channel a client is joining, set by Realtime for its authorization check.
create or replace function realtime.topic() returns text
language sql stable
as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;

-- Broadcast from the database: a row the server streams to whoever has joined
-- the topic. Like Supabase's, a failure is a warning, never an error.
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void
language plpgsql
as $$
begin
  begin
    perform set_config('realtime.topic', topic, true);
    insert into realtime.messages (payload, event, topic, private, extension)
    values (payload, event, topic, private, 'broadcast');
  exception when others then
    raise warning 'ErrorSendingBroadcastMessage: %', sqlerrm;
  end;
end
$$;

grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to anon, authenticated;
grant usage, select on sequence realtime.messages_id_seq to anon, authenticated;
