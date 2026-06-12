import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for cloud sync.
 *
 * The URL + anon key are read from public env vars (inlined at build time).
 * When they are absent the app runs in *local-only* mode: every cloud code
 * path becomes a no-op and the app behaves exactly as it did before, saving
 * only to the browser's localStorage. This keeps local dev and previews
 * working without any configuration.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when Supabase credentials are configured for this build. */
export const isCloudConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "upsc-chronicle-auth",
      },
    })
  : null;
