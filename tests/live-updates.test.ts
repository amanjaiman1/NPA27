import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_TOPIC, LIVE_AREAS, PLATFORM_TOPIC, accountTopic, adminAreasFor, liveAreasOf, liveVersionOf } from "@/lib/platform/live";
import { ADMIN_ROUTES } from "@/lib/platform/server/admin-api";

// Doubled quotes (SQL inside an execute string) read as plain ones.
const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261213120000_live_everywhere.sql"), "utf8").replace(/''/g, "'");

test("a message is read for area names and a version only", () => {
  assert.deepEqual(liveAreasOf({ areas: ["reviews", "users"] }), ["reviews", "users"]);
  assert.deepEqual(liveAreasOf({ areas: ["reviews", "reviews", "drop table", 7, null] }), ["reviews"], "unknown or repeated names are dropped");
  for (const junk of [null, undefined, "reviews", { areas: "reviews" }, []]) assert.deepEqual(liveAreasOf(junk), []);
  assert.equal(liveVersionOf({ areas: ["chronicle"], version: 12 }), 12);
  for (const v of [0, -1, 1.5, "12", null]) assert.equal(liveVersionOf({ version: v }), null);
});

test("the three channels are named as the policies name them", () => {
  assert.equal(PLATFORM_TOPIC, "platform-updates");
  assert.equal(ADMIN_TOPIC, "platform-admin-updates");
  assert.equal(accountTopic("1d000000-0000-4000-8000-000000000004"), "account:1d000000-0000-4000-8000-000000000004");
  assert.match(migration, /\(select realtime\.topic\(\)\) = 'platform-admin-updates'/);
  assert.match(migration, /\(select realtime\.topic\(\)\) = 'account:' \|\| \(select auth\.uid\(\)\)::text/);
  // No policy lets a browser send.
  assert.doesNotMatch(migration, /on realtime\.messages\s+for (insert|update|delete|all)/);
});

test("every area the database sends is one the browser knows, and every one it knows is sent", () => {
  const sent = new Set<string>();
  for (const m of migration.matchAll(/platform_live_(?:notify|owner)\(([^)]*)\)/g)) {
    const args = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    // notify: (channel, areas) pairs; owner: (column, areas).
    for (let i = 1; i < args.length; i += 2) for (const a of args[i].split(",")) sent.add(a);
  }
  for (const m of migration.matchAll(/array\['([a-z]+)'\]/g)) sent.add(m[1]);
  assert.deepEqual([...sent].sort(), [...LIVE_AREAS].sort());
});

test("each Admin Center page follows what it shows", () => {
  assert.deepEqual(adminAreasFor("reviews?status=pending&limit=20&offset=0"), ["reviews"]);
  assert.deepEqual(adminAreasFor("feedback/2f000000-0000-4000-8000-000000000001"), ["feedback", "changelog"]);
  assert.ok(adminAreasFor("users?filter=all").includes("users") && adminAreasFor("users/x").includes("reviews"));
  assert.ok(adminAreasFor("overview").includes("audit"), "the overview shows recent admin actions");
  assert.deepEqual(adminAreasFor("me"), [], "the role check is the Admin Center's own");
  // Every page the Admin API serves with a GET is covered.
  const gets = [...new Set(ADMIN_ROUTES.filter((r) => r.method === "GET").map((r) => r.path.split("/")[0]))];
  for (const page of gets.filter((p) => p !== "me")) assert.ok(adminAreasFor(page).length > 0, `${page} reloads on nothing`);
});

test("sending can't break a change, and nobody but the database can send", () => {
  // Every sender swallows its errors.
  for (const fn of ["platform_live_send", "platform_live_notify", "platform_live_owner", "platform_live_chronicle", "platform_live_auth_user"]) {
    const body = migration.slice(migration.indexOf(`function public.${fn}(`));
    const end = body.indexOf("\n$$;");
    assert.match(body.slice(0, end), /exception when others then/, `${fn} lets an error through`);
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`), `${fn} is callable from a browser`);
  }
  // A failing trigger on auth.users would block sign-ups.
  assert.match(migration, /exception when insufficient_privilege then/);
});
