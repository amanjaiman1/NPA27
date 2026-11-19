/* ════════════════════════════════════════════════════════════════
   WHO IS ASKING
   requireAdmin() is the only way into an admin route:
     1. the request carries a bearer token,
     2. Supabase Auth verifies it, and the user id comes from that check,
     3. the membership is read fresh with the service role,
     4. the role has the permission the route needs.
   Fails with 401 (no or bad token) or 403 (no role, or not this one).

   A verified token is remembered for 30 seconds on this server instance,
   so moving around the Admin Center doesn't call Supabase Auth on every
   request. The role is never cached: a revoked role stops working on the
   next request.
   ════════════════════════════════════════════════════════════════ */

import { createHash } from "node:crypto";
import { can, isPlatformRole, type Actor, type Permission } from "../roles";
import { PlatformError } from "./errors";
import { bearerToken, serviceClient, serviceRpc } from "./rpc";

export interface VerifiedUser {
  id: string;
  email: string | null;
}

const TOKEN_TTL_MS = 30_000;
const verified = new Map<string, { user: VerifiedUser; until: number }>();
const keyOf = (token: string) => createHash("sha256").update(token).digest("base64url");

/** Tests only. */
export function forgetVerifiedTokens(): void {
  verified.clear();
}

/** The account the token belongs to, checked by Supabase Auth; null if it isn't valid. */
export async function verifyToken(token: string): Promise<VerifiedUser | null> {
  const key = keyOf(token);
  const hit = verified.get(key);
  if (hit && hit.until > Date.now()) return hit.user;
  const client = serviceClient();
  if (!client) throw new PlatformError(503, "not_configured", "The Admin Center needs Supabase and its service-role key on the server.");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    verified.delete(key);
    return null;
  }
  const user = { id: data.user.id, email: data.user.email ?? null };
  // Never past the token's own expiry.
  verified.set(key, { user, until: Math.min(Date.now() + TOKEN_TTL_MS, expiryOf(token) ?? Infinity) });
  if (verified.size > 500) {
    const now = Date.now();
    for (const [k, v] of verified) if (v.until <= now) verified.delete(k);
  }
  return user;
}

function expiryOf(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export interface AuthDeps {
  verify: (token: string) => Promise<VerifiedUser | null>;
  whoami: (userId: string) => Promise<{ role: unknown; permissions: unknown } | null>;
}

export const liveAuthDeps: AuthDeps = {
  verify: verifyToken,
  whoami: (userId) => serviceRpc("platform_admin_whoami", { p_user: userId }),
};

/** The verified actor, if they hold `permission`; otherwise a PlatformError (401 or 403). */
export async function requireAdmin(request: Request, permission: Permission, deps: AuthDeps = liveAuthDeps): Promise<Actor> {
  const token = bearerToken(request);
  if (!token) throw new PlatformError(401, "unauthorized", "Sign in to use the Admin Center.");
  const user = await deps.verify(token);
  if (!user) throw new PlatformError(401, "unauthorized", "Your session has ended. Sign in again.");
  const who = await deps.whoami(user.id);
  if (!who || !isPlatformRole(who.role) || !Array.isArray(who.permissions)) {
    throw new PlatformError(403, "no_role", "This account doesn't have access to the Admin Center.");
  }
  const actor: Actor = {
    userId: user.id,
    email: user.email,
    role: who.role,
    permissions: who.permissions.filter((p): p is Permission => typeof p === "string") as Permission[],
  };
  if (!can(actor, permission)) throw new PlatformError(403, "forbidden", "Your role doesn't include this.");
  return actor;
}
