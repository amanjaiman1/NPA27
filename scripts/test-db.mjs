#!/usr/bin/env node
/**
 * Runs the database schema, the migrations and the isolation checks against a
 * throwaway in-memory Postgres (PGlite), with Supabase's roles and `auth`
 * helpers recreated. Nothing touches a real project.
 *
 *     npm run test:db
 *
 * The migrations are applied twice, on purpose: they must be safe to re-run.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/**
 * The parts of a Supabase database the schema relies on: the three API roles,
 * `auth.users`, `auth.uid()`, and the default grants Supabase applies to
 * everything created in `public`.
 */
const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  -- The columns of Supabase's auth.users that the migrations read.
  create table auth.users (
    id uuid primary key,
    email text unique,
    created_at timestamptz not null default now(),
    email_confirmed_at timestamptz default now(),
    last_sign_in_at timestamptz,
    banned_until timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid
  $$;

  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

async function main() {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  // Supabase Storage's tables and helper, which the attachments migration uses.
  await db.exec(read("supabase/tests/storage_shim.sql"));
  // Supabase Realtime's messages table and helpers, for the live-update policies and triggers.
  await db.exec(read("supabase/tests/realtime_shim.sql"));

  await db.exec(read("supabase/schema.sql"));
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const pass of [1, 2]) {
    for (const file of migrations) {
      await db.exec(read(join("supabase/migrations", file)));
    }
    console.log(`✓ schema + ${migrations.length} migration(s) applied (pass ${pass})`);
  }

  // Each check file runs in one transaction, rolls back, and ends with a
  // single row naming what passed.
  const checks = [
    ["supabase/tests/rls_isolation.sql", "All isolation checks passed"],
    ["supabase/tests/platform_admin.sql", "All platform checks passed"],
    ["supabase/tests/platform_trust.sql", "All trust checks passed"],
    ["supabase/tests/platform_help.sql", "All help checks passed"],
    ["supabase/tests/live_updates.sql", "All live update checks passed"],
    ["supabase/tests/last_active.sql", "All last active checks passed"],
  ];
  for (const [file, expected] of checks) {
    const results = await db.exec(read(file));
    const last = results[results.length - 1];
    const verdict = last?.rows?.[0]?.result;
    if (verdict !== expected) {
      throw new Error(`${file}: unexpected result ${JSON.stringify(last?.rows)}`);
    }
    console.log(`✓ ${verdict}`);
  }
  await db.close();
}

main().catch((e) => {
  console.error(`✗ ${e.message ?? e}`);
  process.exit(1);
});
