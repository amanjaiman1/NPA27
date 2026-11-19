import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for accounts and cloud sync.
 *
 * The URL + anon key are read from public env vars (inlined at build time).
 * When they are absent the app runs in *local-only* mode: there are no
 * accounts, every cloud code path becomes a no-op, and data is saved only in
 * this browser. This keeps local dev and previews working without any setup.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when Supabase credentials are configured for this build. */
export const isCloudConfigured = Boolean(url && anonKey);

/** The localStorage key holding the signed-in session. */
export const AUTH_STORAGE_KEY = "upsc-chronicle-auth";

/** What an email link (confirmation, password reset) carried in the URL. */
export interface AuthRedirect {
  /** "signup", "recovery", "magiclink", "email_change"… */
  type: string | null;
  /** Human-readable error from Supabase, e.g. an expired link. */
  error: string | null;
  errorCode: string | null;
}

/**
 * Read before the client is created: the client consumes the link's tokens and
 * strips them from the address bar as it starts, after which there is no way
 * to tell a password-reset visit from an ordinary one.
 */
function readAuthRedirect(): AuthRedirect | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const get = (k: string) => hash.get(k) ?? query.get(k);
  const type = get("type");
  const error = get("error_description") ?? get("error");
  const errorCode = get("error_code");
  if (!type && !error && !errorCode && !hash.get("access_token")) return null;
  return { type, error: error ? error.replace(/\+/g, " ") : null, errorCode };
}

export const initialAuthRedirect: AuthRedirect | null = readAuthRedirect();

/** The site's main address, worked out at build time (next.config.mjs, `emailLinkOrigin`). Empty without one. */
const MAIN_ORIGIN = process.env.NEXT_PUBLIC_EMAIL_LINK_ORIGIN || null;

const isLocalHost = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");

/**
 * Where a link in an account email (confirming the email, resetting the
 * password) takes people: the site's main address, whichever address they
 * were on when they asked for it.
 *
 * Supabase only follows a link back to an address in its Redirect URLs list;
 * anything else goes to its Site URL instead. Built from the visitor's own
 * address, a link asked for on a second address of the same site (`www.`, or
 * a vercel.app one, which Vercel keeps behind its login) ended up there.
 *
 * On this machine (localhost) links come back to this machine. Without a
 * main address (a preview, say) they come back to the address in use.
 */
export function authRedirectUrl(path: string): string {
  const here = typeof window === "undefined" ? null : window.location;
  const base = here && (isLocalHost(here.hostname) || !MAIN_ORIGIN) ? here.origin : (MAIN_ORIGIN ?? "");
  return `${base}${path}`;
}

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: AUTH_STORAGE_KEY,
      },
    })
  : null;

/**
 * Whether this tab arrived through a password-reset link. Subscribed at import
 * time, before the client announces the recovery session, so the event can't be
 * missed by a component that mounts later.
 */
let recovery = initialAuthRedirect?.type === "recovery" && !initialAuthRedirect.error;
supabase?.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") recovery = true;
});

export function isPasswordRecovery(): boolean {
  return recovery;
}

export function endPasswordRecovery(): void {
  recovery = false;
}
