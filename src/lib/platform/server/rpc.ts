/* ════════════════════════════════════════════════════════════════
   CALLING THE PLATFORM FUNCTIONS FROM THE SERVER
   Two ways, and only two:

   serviceRpc   the service-role key, for platform_admin_* functions. It
                bypasses RLS, so it is only used after requireAdmin() has
                verified who is asking, and every admin function checks
                the actor's role again itself.
   userRpc      the anon key with the person's own access token, for the
                functions that act on `auth.uid()`. The database verifies
                the token, so the server can't act as anyone else.

   Server only. Responses are never cached.
   ════════════════════════════════════════════════════════════════ */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fromDbError, PlatformError } from "./errors";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const noStore: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });
const options = (headers?: Record<string, string>) => ({
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: noStore, ...(headers ? { headers } : {}) },
});

let service: SupabaseClient | null = null;

/** The service-role client, or null when the key isn't configured. */
export function serviceClient(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  service ??= createClient(url, serviceKey, options());
  return service;
}

function unavailable(): PlatformError {
  return new PlatformError(503, "not_configured", "The Admin Center needs Supabase and its service-role key on the server.");
}

export async function serviceRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const client = serviceClient();
  if (!client) throw unavailable();
  const { data, error } = await client.rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}

export async function userRpc<T = unknown>(token: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!url || !anonKey) throw new PlatformError(503, "not_configured", "Accounts aren't set up on this server.");
  const client = createClient(url, anonKey, options({ Authorization: `Bearer ${token}` }));
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    // An expired or forged token is refused before the function runs.
    if (/jwt|token/i.test(error.message ?? "") && !/^platform:/.test(error.message ?? "")) {
      throw new PlatformError(401, "unauthorized", "Sign in again.");
    }
    throw fromDbError(error);
  }
  return data as T;
}

/** The bearer token from the request, if any. */
export function bearerToken(request: Request): string | null {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return token ? token : null;
}
