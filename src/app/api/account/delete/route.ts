import { NextResponse } from "next/server";
import { adminClient, userIdFromToken } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Permanently deletes the caller's account.
 *
 * Who is deleted comes only from the verified bearer token, never from the
 * request body, so nobody can delete anyone but themselves. The token must also
 * be fresh: the app has the student re-enter their password immediately before
 * calling this, which mints a new one, so a session left open on a borrowed
 * computer can't be used to destroy the account later.
 *
 * Deleting the auth user cascades (`on delete cascade`) to the snapshot, the
 * push subscriptions and the delivery log, in one database operation.
 */
const MAX_TOKEN_AGE_SECONDS = 10 * 60;
const CONFIRM_PHRASE = "DELETE";

function issuedAt(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iat?: unknown };
    return typeof json.iat === "number" ? json.iat : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Account deletion isn't configured on the server. The owner needs to set SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  const authorisation = request.headers.get("authorization");
  const userId = await userIdFromToken(admin, authorisation);
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const token = authorisation?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const iat = issuedAt(token);
  if (!iat || Date.now() / 1000 - iat > MAX_TOKEN_AGE_SECONDS) {
    return NextResponse.json(
      { error: "Confirm your password again, then retry.", code: "reauthenticate" },
      { status: 401 },
    );
  }

  let body: { confirm?: unknown };
  try {
    body = (await request.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `Type ${CONFIRM_PHRASE} to confirm.` }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: "The account couldn't be deleted. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
