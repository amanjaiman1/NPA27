/* ════════════════════════════════════════════════════════════════
   ADMIN CENTER ROLES
   Who may run the platform, and what each role may do. Shared by the
   API (which enforces it) and the Admin Center's navigation (which only
   hides what the API would refuse anyway).

   The same table exists in SQL (`platform_permissions` in
   supabase/migrations/20261204120000_platform_admin.sql), checked again
   inside every admin database function. The admin e2e test compares the
   two. A role is never a product entitlement: see lib/features.ts.
   ════════════════════════════════════════════════════════════════ */

export const PLATFORM_ROLES = ["super_admin", "admin", "moderator"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PERMISSIONS = [
  "admin.access",
  "analytics.read",
  "users.read",
  "users.suspend",
  "reviews.moderate",
  /** Hiding a published review, and restoring a hidden one. */
  "reviews.hide",
  "feedback.manage",
  "announcements.manage",
  "changelog.manage",
  "settings.manage",
  "access.manage",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<PlatformRole, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: [
    "admin.access",
    "analytics.read",
    "users.read",
    "users.suspend",
    "reviews.moderate",
    "reviews.hide",
    "feedback.manage",
    "announcements.manage",
    "changelog.manage",
  ],
  moderator: ["admin.access", "reviews.moderate"],
};

/** The platform settings that widen a role. Defaults are the settings' own defaults. */
export interface PermissionSwitches {
  /** Moderators also handle the Feedback Center. Off by default. */
  moderatorsHandleFeedback?: boolean;
  /** Moderators may hide and restore published reviews. On by default. */
  moderatorsHideReviews?: boolean;
  /** Admins may read the audit log. Off by default. */
  adminsReadAudit?: boolean;
}

export const ROLE_LABEL: Record<PlatformRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  moderator: "Moderator",
};

export const ROLE_SUMMARY: Record<PlatformRole, string> = {
  super_admin: "Everything, including settings, access and the audit log.",
  admin: "Users, reviews, feedback, announcements, changelog and figures; the audit log if the setting allows it.",
  moderator: "Reviews (hiding them if the setting allows it), and feedback if the setting allows it.",
};

/** Roles a Super Admin may grant in the app. Super Admin itself is only granted in the SQL Editor. */
export const GRANTABLE_ROLES = ["admin", "moderator"] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function isGrantableRole(value: unknown): value is GrantableRole {
  return typeof value === "string" && (GRANTABLE_ROLES as readonly string[]).includes(value);
}

/** What a role may do, given the platform settings that widen roles. */
export function permissionsFor(role: PlatformRole, options: PermissionSwitches = {}): Permission[] {
  const base: Permission[] = [...MATRIX[role]];
  if (role === "moderator" && options.moderatorsHideReviews !== false) base.push("reviews.hide");
  if (role === "moderator" && options.moderatorsHandleFeedback) base.push("feedback.manage");
  if (role === "admin" && options.adminsReadAudit) base.push("audit.read");
  return PERMISSIONS.filter((p) => base.includes(p));
}

export interface Actor {
  userId: string;
  email: string | null;
  role: PlatformRole;
  permissions: Permission[];
}

export function can(actor: Pick<Actor, "permissions"> | null | undefined, permission: Permission): boolean {
  return Boolean(actor?.permissions.includes(permission));
}

/**
 * Whether an account with this role is for running the platform rather than
 * for preparing. Signing in with it, opening the site or the installed app,
 * or opening any page of the student app takes it to the Admin Center, so it
 * never goes through student setup or sees the student dashboard.
 *
 * Only Super Admin: Admins and Moderators are granted to existing student
 * accounts (see docs/ADMIN_SETUP.md), so they keep their app and reach the
 * Admin Center from the account menu. This only decides where to go; what
 * anyone may do is checked on the server.
 */
export function opensAdminCenter(role: PlatformRole | null | undefined): boolean {
  return role === "super_admin";
}
