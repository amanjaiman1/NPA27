-- ════════════════════════════════════════════════════════════════
-- The parts of Supabase Storage the attachment migration relies on, for
-- local runs only (`npm run test:db` and the mock Supabase). A real
-- project already has all of this: never run it there.
--
-- Mirrors Supabase's own definitions closely enough for the policies in
-- migrations/*_journal_attachments.sql to behave as they do in production:
-- the same tables and columns the policies read, row-level security on,
-- and the same `storage.foldername` helper.
-- ════════════════════════════════════════════════════════════════

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  owner_id text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated;
grant all on storage.buckets to service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
