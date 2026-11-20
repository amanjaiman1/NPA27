import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The address in the sign-up confirmation email:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 *
 * This route only checks the request and hands it on. The session itself is
 * made in the browser, by the app's one Supabase client, on /auth/verify:
 * DoOrDie keeps sessions in the browser's storage (there are no auth cookies
 * and no middleware), so a server route can't store one, and the service-role
 * key is never used for a person's own sign-in.
 *
 * - A good request goes to /auth/verify with the token in the #fragment, which
 *   browsers don't send to servers or put in their logs.
 * - A missing or unusable one goes to /auth/callback, the branded "This link
 *   can't be used" screen the app already has, with a code and no token.
 */
const TYPES = new Set(["email", "signup"]);
const TOKEN = /^[A-Za-z0-9_-]{8,200}$/;

function to(request: NextRequest, path: string, hash = "") {
  // 303: a link click is a GET, and nothing about it should be repeated.
  return NextResponse.redirect(new URL(`${path}${hash}`, request.nextUrl.origin), 303);
}

export function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")?.trim() ?? "";
  const type = request.nextUrl.searchParams.get("type")?.trim() ?? "";
  if (!tokenHash || !TYPES.has(type)) {
    return to(request, "/auth/callback?error=access_denied&error_code=otp_invalid&error_description=Email+link+is+invalid");
  }
  if (!TOKEN.test(tokenHash)) {
    return to(request, "/auth/callback?error=access_denied&error_code=otp_invalid&error_description=Email+link+is+invalid");
  }
  return to(request, "/auth/verify", `#token_hash=${encodeURIComponent(tokenHash)}&type=${type}`);
}
