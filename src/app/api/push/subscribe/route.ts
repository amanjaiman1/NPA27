import { NextResponse } from "next/server";
import { adminClient, userIdFromToken } from "@/lib/supabase-admin";

/** web-push needs Node's crypto; the Edge runtime cannot sign VAPID. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Register one device for background push.
 *
 * The user id is taken from the verified bearer token, never from the body — a
 * body-supplied id would let anyone attach a subscription to someone else's
 * account and receive their notifications.
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
  const p256dh = typeof body.p256dh === "string" ? body.p256dh : null;
  const auth = typeof body.auth === "string" ? body.auth : null;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "endpoint, p256dh and auth are all required." },
      { status: 400 },
    );
  }

  const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 400) : null);

  /**
   * Conflict on `endpoint`, not on the row id: the same browser re-subscribing
   * must update its existing row rather than accumulate duplicates, and the
   * endpoint is the only thing that identifies a device across sessions.
   *
   * `failure_count` resets — a device that just told us it is alive has earned a
   * clean slate, whatever happened to it before.
   */
  const { error } = await admin.from("chronicle_push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      key_p256dh: p256dh,
      key_auth: auth,
      platform: str(body.platform),
      timezone: str(body.timezone),
      user_agent: str(body.userAgent),
      last_seen_at: new Date().toISOString(),
      failure_count: 0,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
