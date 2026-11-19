"use client";

/* ════════════════════════════════════════════════════════════════
   THIS ACCOUNT'S ADMIN CENTER ROLE, AS THIS BROWSER KNOWS IT
   Decides where to go and whether to show the Admin Center link. It
   never decides what anyone may do: the Admin Center checks the role
   on the server for every page and every request.

   The database answers for the session's own account
   (`platform_my_role`). The answer is kept in this browser under the
   account's own key, so opening the app can send a Super Admin to the
   Admin Center before anything of the student app appears. It is asked
   again in the background at most every five minutes, and fresh at
   every sign-in. Signing out removes it.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from "@/lib/supabase";
import { readKey, removeKey, writeKey } from "@/lib/account/scope";
import { isPlatformRole, type PlatformRole } from "./roles";

/** `<prefix>:<user id>`. Listed in `ACCOUNT_KEY_PREFIXES`, so a full sign-out removes it. */
export const ROLE_KEY_PREFIX = "upsc-chronicle-platform-role";

/** How long an answer is used without asking again. */
export const ROLE_FRESH_MS = 5 * 60_000;

const keyFor = (userId: string) => `${ROLE_KEY_PREFIX}:${userId}`;

export interface KnownRole {
  role: PlatformRole | null;
  /** When the database gave this answer (ms since the epoch). */
  at: number;
}

/** The last answer this browser had for the account, however old. Null if it never asked. */
export function knownRole(userId: string): KnownRole | null {
  try {
    const v = JSON.parse(readKey(keyFor(userId)) ?? "null") as { role?: unknown; at?: unknown } | null;
    if (!v || typeof v.at !== "number") return null;
    return { role: isPlatformRole(v.role) ? v.role : null, at: v.at };
  } catch {
    return null;
  }
}

export function rememberRole(userId: string, role: PlatformRole | null): void {
  writeKey(keyFor(userId), JSON.stringify({ role, at: Date.now() }));
}

export function forgetRole(userId: string): void {
  removeKey(keyFor(userId));
}

const inflight = new Map<string, Promise<PlatformRole | null | undefined>>();

function ask(userId: string): Promise<PlatformRole | null | undefined> {
  const pending = inflight.get(userId);
  if (pending) return pending;
  const p = (async () => {
    if (!supabase) return undefined;
    const { data, error } = await supabase.rpc("platform_my_role");
    // Not set up, offline or refused: nothing is remembered, so the next page asks again.
    if (error) return undefined;
    const raw = (data as { role?: unknown } | null)?.role;
    const role = isPlatformRole(raw) ? raw : null;
    rememberRole(userId, role);
    return role;
  })()
    .catch(() => undefined)
    .finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
}

/**
 * The account's role: the last answer if it is younger than `maxAgeMs`,
 * otherwise the database's. Resolves to `undefined` when the database
 * couldn't be asked within `timeoutMs` (offline, not set up), so the caller
 * keeps whatever it knew.
 */
export function checkRole(
  userId: string,
  { maxAgeMs = ROLE_FRESH_MS, timeoutMs = 8_000 }: { maxAgeMs?: number; timeoutMs?: number } = {},
): Promise<PlatformRole | null | undefined> {
  const known = knownRole(userId);
  if (known && Date.now() - known.at < maxAgeMs) return Promise.resolve(known.role);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    void ask(userId).then((role) => {
      clearTimeout(timer);
      resolve(role);
    });
  });
}
