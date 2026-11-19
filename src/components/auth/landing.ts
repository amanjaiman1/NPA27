"use client";

import { checkRole, knownRole } from "@/lib/platform/my-role";
import { opensAdminCenter } from "@/lib/platform/roles";
import { safeNext } from "./auth-ui";

/** How long sign-in waits for the role before carrying on as a student account. */
const SIGN_IN_ROLE_WAIT_MS = 6_000;

function isAdminCenterPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin?");
}

/**
 * Where an account goes once it has signed in: a Super Admin to the Admin
 * Center (or the Admin Center page it was sent to sign in for), everyone
 * else to `next` or the dashboard, as before.
 *
 * Asks the database fresh, so a role granted or removed since the last
 * visit counts at once. Offline, or when it can't be asked in time, the
 * last answer this browser had decides; with none, the app opens.
 */
export async function landingAfterSignIn(
  userId: string,
  next: string | null,
  { offline = false }: { offline?: boolean } = {},
): Promise<string> {
  const target = safeNext(next);
  const asked = offline ? undefined : await checkRole(userId, { maxAgeMs: 0, timeoutMs: SIGN_IN_ROLE_WAIT_MS });
  const role = asked === undefined ? (knownRole(userId)?.role ?? null) : asked;
  if (opensAdminCenter(role)) return isAdminCenterPath(target) ? target : "/admin";
  return target;
}
