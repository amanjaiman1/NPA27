import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* ════════════════════════════════════════════════════════════════
   SERVER-ONLY SUPABASE CLIENT
   Holds the service-role key, which bypasses Row Level Security.

   This module must never be imported from a client component. There is no
   `"use client"` here and no `NEXT_PUBLIC_` on the key, so a stray import
   would fail the build rather than leak the key into the bundle — but the
   rule is worth stating: nothing in `components/` should reach for this.
   ════════════════════════════════════════════════════════════════ */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** True when the server has what it needs to read every subscriber's data. */
export const isAdminConfigured = Boolean(url && serviceRoleKey);

/**
 * A client that can read any row. Created per request rather than at module
 * scope so a missing key is a handled 503 at call time, not an import-time crash
 * that takes the whole route down.
 */
export function adminClient(): SupabaseClient | null {
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve a caller's bearer token to a user id.
 *
 * The token comes from the browser's Supabase session and is verified by
 * Supabase itself — the route never trusts a user id sent in a request body,
 * which would let anyone register a subscription against someone else's account.
 */
export async function userIdFromToken(
  admin: SupabaseClient,
  authorisation: string | null,
): Promise<string | null> {
  const token = authorisation?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
