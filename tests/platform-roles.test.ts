import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRANTABLE_ROLES,
  PERMISSIONS,
  PLATFORM_ROLES,
  can,
  isGrantableRole,
  isPlatformRole,
  permissionsFor,
} from "@/lib/platform/roles";
import { ADMIN_NAV_ITEMS, activeAdminItem } from "@/lib/platform/nav";

/* The same table exists in SQL (platform_permissions); the admin e2e test
   compares the two against a real database. */

test("a Super Admin holds every permission", () => {
  assert.deepEqual(permissionsFor("super_admin"), [...PERMISSIONS]);
});

test("an Admin runs the platform but can't touch settings, access or the audit log", () => {
  const p = permissionsFor("admin");
  for (const held of ["admin.access", "users.read", "users.suspend", "reviews.moderate", "feedback.manage", "announcements.manage", "changelog.manage"]) {
    assert.ok(p.includes(held as never), `admin should hold ${held}`);
  }
  for (const withheld of ["settings.manage", "access.manage", "audit.read"]) {
    assert.ok(!p.includes(withheld as never), `admin must not hold ${withheld}`);
  }
});

test("a Moderator moderates reviews, and feedback only when the setting allows it", () => {
  assert.deepEqual(permissionsFor("moderator"), ["admin.access", "reviews.moderate"]);
  assert.deepEqual(permissionsFor("moderator", { moderatorsHandleFeedback: true }), ["admin.access", "reviews.moderate", "feedback.manage"]);
  // The setting is about Moderators only.
  assert.deepEqual(permissionsFor("admin", { moderatorsHandleFeedback: true }), permissionsFor("admin"));
});

test("permissions come out in one fixed order, whatever the role", () => {
  for (const role of PLATFORM_ROLES) {
    const p = permissionsFor(role, { moderatorsHandleFeedback: true });
    assert.deepEqual(p, PERMISSIONS.filter((x) => p.includes(x)));
  }
});

test("Super Admin can never be granted from the app", () => {
  assert.deepEqual([...GRANTABLE_ROLES], ["admin", "moderator"]);
  assert.equal(isGrantableRole("super_admin"), false);
  assert.equal(isGrantableRole("moderator"), true);
  assert.equal(isPlatformRole("super_admin"), true);
  for (const forged of ["owner", "root", "SUPER_ADMIN", "", null, undefined, 1, { role: "admin" }]) {
    assert.equal(isPlatformRole(forged), false, `${String(forged)} isn't a role`);
  }
});

test("can() is false without an actor or without the permission", () => {
  assert.equal(can(null, "admin.access"), false);
  assert.equal(can(undefined, "admin.access"), false);
  assert.equal(can({ permissions: ["admin.access"] }, "audit.read"), false);
  assert.equal(can({ permissions: ["admin.access", "audit.read"] }, "audit.read"), true);
});

test("every Admin Center page names a real permission, and pages resolve to their own entry", () => {
  for (const item of ADMIN_NAV_ITEMS) {
    assert.ok((PERMISSIONS as readonly string[]).includes(item.permission), `${item.href} names ${item.permission}`);
    assert.ok(item.href === "/admin" || item.href.startsWith("/admin/"), `${item.href} sits under /admin`);
  }
  assert.equal(activeAdminItem("/admin")?.href, "/admin");
  assert.equal(activeAdminItem("/admin/users")?.href, "/admin/users");
  assert.equal(activeAdminItem("/admin/feedback/anything")?.href, "/admin/feedback");
  // The pages only Super Admins hold are the three control pages.
  const superOnly = ADMIN_NAV_ITEMS.filter((i) => !permissionsFor("admin").includes(i.permission)).map((i) => i.href);
  assert.deepEqual(superOnly.sort(), ["/admin/access", "/admin/audit", "/admin/settings"]);
});
