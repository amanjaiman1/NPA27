import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_ROUTES, PUBLIC_TAGS, handleAdminRequest, matchRoute, mutationLimiter, type AdminDeps } from "@/lib/platform/server/admin-api";
import { PlatformError } from "@/lib/platform/server/errors";
import { PERMISSIONS, PLATFORM_ROLES, permissionsFor, type PlatformRole } from "@/lib/platform/roles";

/* The Admin API's dispatcher with fake dependencies: no network, no database.
   What the database itself refuses is tested in supabase/tests/platform_admin.sql,
   and the two together end to end in tests/e2e/admin.e2e.mjs. */

const ID = {
  super_admin: "0a000000-0000-4000-8000-000000000001",
  admin: "0b000000-0000-4000-8000-000000000002",
  moderator: "0c000000-0000-4000-8000-000000000003",
  student: "0d000000-0000-4000-8000-000000000004",
} as const;
const TARGET = "0e000000-0000-4000-8000-000000000005";
const TOKEN: Record<string, string> = { "t-super": ID.super_admin, "t-admin": ID.admin, "t-mod": ID.moderator, "t-student": ID.student };
const ROLE_OF: Record<string, PlatformRole> = { [ID.super_admin]: "super_admin", [ID.admin]: "admin", [ID.moderator]: "moderator" };
const TOKEN_FOR: Record<PlatformRole, string> = { super_admin: "t-super", admin: "t-admin", moderator: "t-mod" };

function fake(over: Partial<AdminDeps> = {}) {
  const calls = { rpc: [] as { fn: string; args: Record<string, unknown> }[], bans: [] as string[][], revalidated: [] as string[] };
  const deps: AdminDeps = {
    verify: async (token) => (TOKEN[token] ? { id: TOKEN[token], email: `${token}@example.com` } : null),
    whoami: async (id) => (ROLE_OF[id] ? { role: ROLE_OF[id], permissions: permissionsFor(ROLE_OF[id]) } : null),
    rpc: async <T>(fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args });
      return (fn === "platform_admin_find_account" ? { id: TARGET } : { fn }) as T;
    },
    setBan: async (id, duration) => void calls.bans.push([id, duration]),
    signScreenshot: async () => null,
    revalidate: (tags) => void calls.revalidated.push(...tags),
    allowMutation: () => true,
    ...over,
  };
  return { deps, calls };
}

async function call(deps: AdminDeps, method: string, path: string, opts: { token?: string; body?: unknown; raw?: string; site?: string } = {}) {
  const headers: Record<string, string> = { "sec-fetch-site": opts.site ?? "same-origin" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  if (body !== undefined) headers["content-type"] = "application/json";
  const request = new Request(`https://doordie.example/api/admin/${path}`, { method, headers, body });
  const res = await handleAdminRequest(request, path.split("?")[0].split("/"), deps);
  return { status: res.status, body: (await res.json()) as { data?: unknown; error?: string; code?: string }, headers: res.headers };
}

const concrete = (path: string) => path.replace(/:[a-z]+/g, TARGET);

test("every route names a known permission, and no two routes share an address", () => {
  const seen = new Set<string>();
  for (const r of ADMIN_ROUTES) {
    assert.ok((PERMISSIONS as readonly string[]).includes(r.permission), `${r.method} ${r.path} names ${r.permission}`);
    const key = `${r.method} ${r.path}`;
    assert.ok(!seen.has(key), `${key} is declared twice`);
    seen.add(key);
  }
  assert.ok(ADMIN_ROUTES.length >= 25);
});

/* The design, written out: which permission each address needs. A route
   added or loosened without updating this table fails here. */
const EXPECTED: Record<string, string> = {
  "GET me": "admin.access",
  "GET overview": "admin.access",
  "GET users": "users.read",
  "GET users/:id": "users.read",
  "POST users/:id/suspend": "users.suspend",
  "POST users/:id/restore": "users.suspend",
  "GET reviews": "reviews.moderate",
  "GET reviews/:id": "reviews.moderate",
  "POST reviews/:id/moderate": "reviews.moderate",
  "PUT reviews/:id/response": "reviews.moderate",
  "GET feedback": "feedback.manage",
  "GET feedback/:id": "feedback.manage",
  "PATCH feedback/:id": "feedback.manage",
  "POST feedback/:id/notes": "feedback.manage",
  "PUT feedback/:id/response": "feedback.manage",
  "GET announcements": "announcements.manage",
  "POST announcements": "announcements.manage",
  "PATCH announcements/:id": "announcements.manage",
  "POST announcements/:id/action": "announcements.manage",
  "DELETE announcements/:id": "announcements.manage",
  "GET changelog": "changelog.manage",
  "POST changelog": "changelog.manage",
  "PATCH changelog/:id": "changelog.manage",
  "POST changelog/:id/action": "changelog.manage",
  "DELETE changelog/:id": "changelog.manage",
  "GET settings": "settings.manage",
  "PATCH settings": "settings.manage",
  "GET access": "access.manage",
  "POST access": "access.manage",
  "PATCH access/:id": "access.manage",
  "DELETE access/:id": "access.manage",
  "GET audit": "audit.read",
};

test("each address needs the permission the design gives it", () => {
  const actual = Object.fromEntries(ADMIN_ROUTES.map((r) => [`${r.method} ${r.path}`, r.permission]));
  assert.deepEqual(actual, EXPECTED);
});

test("without a session, every route and every unknown address answers 401", async () => {
  const { deps, calls } = fake();
  for (const r of ADMIN_ROUTES) {
    const res = await call(deps, r.method, concrete(r.path), { body: r.method === "GET" ? undefined : {} });
    assert.equal(res.status, 401, `${r.method} ${r.path}`);
  }
  assert.equal((await call(deps, "GET", "secret-page")).status, 401);
  assert.equal((await call(deps, "GET", "users", { token: "forged-token" })).status, 401);
  assert.equal(calls.rpc.length, 0, "nothing reached the database");
});

test("a signed-in student without a role gets 403 everywhere, and learns nothing about addresses", async () => {
  const { deps, calls } = fake();
  for (const r of ADMIN_ROUTES) {
    const res = await call(deps, r.method, concrete(r.path), { token: "t-student", body: r.method === "GET" ? undefined : {} });
    assert.equal(res.status, 403, `${r.method} ${r.path}`);
  }
  assert.equal((await call(deps, "GET", "no-such-thing", { token: "t-student" })).status, 403);
  assert.equal(calls.rpc.length, 0);
});

test("each role reaches exactly the routes its permissions cover", async () => {
  for (const role of PLATFORM_ROLES) {
    const held = permissionsFor(role);
    for (const r of ADMIN_ROUTES) {
      const { deps } = fake();
      const res = await call(deps, r.method, concrete(r.path), { token: TOKEN_FOR[role], body: r.method === "GET" ? undefined : {} });
      if (held.includes(r.permission)) {
        assert.notEqual(res.status, 403, `${role} should reach ${r.method} ${r.path}`);
        assert.notEqual(res.status, 401, `${role} should reach ${r.method} ${r.path}`);
      } else {
        assert.equal(res.status, 403, `${role} must not reach ${r.method} ${r.path}`);
      }
    }
  }
});

test("changes from another site are refused before anything else happens", async () => {
  const { deps, calls } = fake();
  for (const r of ADMIN_ROUTES.filter((x) => x.method !== "GET")) {
    const res = await call(deps, r.method, concrete(r.path), { token: "t-super", body: {}, site: "cross-site" });
    assert.equal(res.status, 403, `${r.method} ${r.path}`);
    assert.equal(res.body.code, "cross_site");
  }
  assert.equal(calls.rpc.length, 0);
  // Reading is allowed from anywhere a token can be sent from: the token is the check.
  assert.equal((await call(deps, "GET", "me", { token: "t-super", site: "cross-site" })).status, 200);
});

test("an unknown address is a 404 only for someone with access, and ids must be UUIDs", async () => {
  const { deps } = fake();
  assert.equal((await call(deps, "GET", "no-such-thing", { token: "t-mod" })).status, 404);
  assert.equal((await call(deps, "GET", "users/not-a-uuid", { token: "t-super" })).status, 404);
  assert.equal((await call(deps, "GET", `users/${TARGET}'--`, { token: "t-super" })).status, 404);
  assert.equal(matchRoute("GET", ["users", TARGET.toUpperCase()])?.params.id, TARGET, "ids are passed on in lower case");
  assert.equal(matchRoute("DELETE", ["users", TARGET]), null, "there is no way to delete an account here");
});

test("the database is always told who the verified actor is, never someone named in the request", async () => {
  const { deps, calls } = fake();
  const res = await call(deps, "POST", "access", {
    token: "t-super",
    body: { email: "helper@example.com", role: "moderator", p_actor: ID.student, actor: ID.student },
  });
  assert.equal(res.status, 200);
  assert.ok(calls.rpc.length > 0);
  for (const c of calls.rpc) assert.equal(c.args.p_actor, ID.super_admin, `${c.fn} got the verified actor`);
  const me = await call(deps, "GET", "me", { token: "t-mod" });
  assert.deepEqual(me.body.data, { userId: ID.moderator, email: "t-mod@example.com", role: "moderator", permissions: permissionsFor("moderator") });
});

test("a suspension is checked, then applied, then recorded; if recording fails the ban is lifted again", async () => {
  const ok = fake();
  const done = await call(ok.deps, "POST", `users/${TARGET}/suspend`, { token: "t-admin", body: { reason: "Repeated spam in feedback", length: "7" } });
  assert.equal(done.status, 200);
  assert.deepEqual(ok.calls.rpc.map((c) => c.fn), ["platform_admin_account_check", "platform_admin_account_record"]);
  assert.deepEqual(ok.calls.bans, [[TARGET, "168h"]]);

  const failing = fake({
    rpc: async <T>(fn: string) => {
      if (fn === "platform_admin_account_record") throw new PlatformError(500, "server", "The audit log refused the entry.");
      return {} as T;
    },
  });
  const res = await call(failing.deps, "POST", `users/${TARGET}/suspend`, { token: "t-admin", body: { reason: "Repeated spam in feedback" } });
  assert.equal(res.status, 500);
  assert.equal(failing.calls.bans.length, 2);
  assert.equal(failing.calls.bans[1][1], "none", "an unrecorded ban doesn't stay in place");

  const refused = fake({
    rpc: async <T>(fn: string) => {
      if (fn === "platform_admin_account_check") throw new PlatformError(403, "forbidden", "Remove the role first.");
      return {} as T;
    },
  });
  assert.equal((await call(refused.deps, "POST", `users/${TARGET}/suspend`, { token: "t-admin", body: { reason: "Repeated spam" } })).status, 403);
  assert.equal(refused.calls.bans.length, 0, "a refused suspension never reaches Supabase Auth");
});

test("bad bodies are refused plainly, and too many changes in a short time are paused", async () => {
  const { deps } = fake();
  assert.equal((await call(deps, "PATCH", "settings", { token: "t-super", raw: "{not json" })).status, 400);
  assert.equal((await call(deps, "PATCH", "settings", { token: "t-super", raw: JSON.stringify({ x: "y".repeat(70_000) }) })).status, 413);
  assert.equal((await call(deps, "PATCH", "settings", { token: "t-super", body: { review_min_days: "lots" } })).status, 400);

  const limited = fake({ allowMutation: () => false });
  const res = await call(limited.deps, "POST", "announcements", { token: "t-admin", body: {} });
  assert.equal(res.status, 429);
  assert.equal(limited.calls.rpc.length, 0);

  const allow = mutationLimiter(2, 60_000);
  assert.deepEqual([allow("a"), allow("a"), allow("a"), allow("b")], [true, true, false, true]);
});

test("changing settings rebuilds the public pages that show them", async () => {
  const { deps, calls } = fake();
  assert.equal((await call(deps, "PATCH", "settings", { token: "t-super", body: { testimonials_on_home: false } })).status, 200);
  assert.ok(calls.revalidated.includes(PUBLIC_TAGS.site) && calls.revalidated.includes(PUBLIC_TAGS.testimonials));
});

test("answers are never cached or indexed", async () => {
  const { deps } = fake();
  for (const res of [await call(deps, "GET", "me", { token: "t-super" }), await call(deps, "GET", "me")]) {
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(res.headers.get("x-robots-tag"), "noindex");
  }
});
