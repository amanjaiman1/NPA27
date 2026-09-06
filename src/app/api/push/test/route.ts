import { NextResponse } from "next/server";
import webpush, { WebPushError } from "web-push";
import { adminClient, userIdFromToken } from "@/lib/supabase-admin";
import {
  isGoneForever,
  payloadForPlatform,
  type PushPayload,
} from "@/lib/push-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send a test notification to the caller's own devices, right now.
 *
 * This exists because the normal path is deliberately hard to observe on demand:
 * quiet hours, the digest hour, the per-day cap and the per-subject cooldown all
 * conspire — correctly — to send nothing most of the time. That makes "did I set
 * this up properly?" almost impossible to answer without waiting until morning.
 *
 * So this bypasses `planDelivery` entirely and pushes a fixed payload. What it
 * proves is the whole delivery *pipe*: subscription → server → push service →
 * service worker → a notification on screen. It says nothing about the rules,
 * which are covered by their own tests.
 *
 * Two deliberate choices:
 *  - It is authenticated as the *user*, not with `CRON_SECRET`, and only ever
 *    sends to that user's own rows. It cannot be used to notify anyone else.
 *  - It does **not** touch `chronicle_push_log`. A test must not burn the day's
 *    cap or set a cooldown, or testing would suppress the real notification you
 *    were testing for.
 */
export async function POST(request: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json(
      { error: "VAPID keys are not configured." },
      { status: 503 },
    );
  }

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

  const { data: rows, error } = await admin
    .from("chronicle_push_subscriptions")
    .select("endpoint, key_p256dh, key_auth, platform")
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No devices are subscribed. Turn on “Even when the app is closed” first.",
      },
      { status: 400 },
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const base: PushPayload = {
    title: "Background push is working",
    body: "This is a test. Real notifications follow your schedule and quiet hours.",
    href: "/",
    tag: "chronicle-test",
    // Deliberately absent: no badgeCount. A test should not leave a number on
    // your dock for something that was never real.
  };

  let sent = 0;
  const failed: { platform: string | null; status?: number }[] = [];
  const dead: string[] = [];

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint as string,
          keys: {
            p256dh: row.key_p256dh as string,
            auth: row.key_auth as string,
          },
        },
        JSON.stringify(
          payloadForPlatform(base, row.platform as string | null, "normal"),
        ),
        { TTL: 60, urgency: "high" },
      );
      sent++;
    } catch (e) {
      const status = e instanceof WebPushError ? e.statusCode : undefined;
      failed.push({ platform: (row.platform as string | null) ?? null, status });
      if (isGoneForever(status)) dead.push(row.endpoint as string);
    }
  }

  // A device the push service has retired is worth clearing out even from a
  // test — it would only fail again on the next real send.
  if (dead.length) {
    await admin
      .from("chronicle_push_subscriptions")
      .delete()
      .in("endpoint", dead);
  }

  return NextResponse.json({
    ok: sent > 0,
    devices: rows.length,
    sent,
    failed,
    pruned: dead.length,
  });
}
