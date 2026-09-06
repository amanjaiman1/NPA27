import { NextResponse } from "next/server";
import { adminClient, userIdFromToken } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forget one device.
 *
 * The delete is scoped to the caller's own user id as well as the endpoint.
 * Endpoints are unguessably long, but "hard to guess" is not an access control —
 * scoping it means a leaked endpoint still cannot be used to unsubscribe
 * somebody else's phone.
 */
export async function POST(request: Request) {
  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Push is not configured on the server." },
      { status: 503 },
    );
  }

  const userId = await userIdFromToken(
    admin,
    request.headers.get("authorization"),
  );
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint is required." }, { status: 400 });
  }

  const { error } = await admin
    .from("chronicle_push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
