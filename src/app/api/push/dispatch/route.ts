import { NextResponse } from "next/server";
import webpush, { WebPushError } from "web-push";
import { adminClient } from "@/lib/supabase-admin";
import {
  decideForUser,
  groupByUser,
  isGoneForever,
  payloadForPlatform,
  type SubscriptionRow,
  type Snapshot,
} from "@/lib/push-dispatch";
import type { DeliveryLog } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send the notifications that are due, to every subscribed device.
 *
 * Called on a schedule — see docs/notifications.md for the cron options. Every
 * decision is made by the same pure engine the browser uses, so a pushed
 * notification and the bell can never disagree; this route is the I/O around it.
 *
 * Run it often. The engine's own rate limits (one per subject per day, the
 * per-day cap, the minimum gap, quiet hours, the digest hour) are what decide
 * whether anything is actually sent, so calling every 15 minutes does not mean
 * notifying every 15 minutes — it means the hour-gated rules fire close to their
 * hour instead of up to an hour late.
 */

interface Row extends SubscriptionRow {
  user_id: string;
}

function configuredVapid(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { subject, publicKey, privateKey };
}

export async function POST(request: Request) {
  return dispatch(request);
}

/**
 * GET as well as POST: most schedulers (Vercel Cron among them) only ever issue
 * a GET. The bearer secret is what protects it, not the verb.
 */
export async function GET(request: Request) {
  return dispatch(request);
}

async function dispatch(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set; dispatch is disabled." },
      { status: 503 },
    );
  }
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const vapid = configuredVapid();
  if (!vapid) {
    return NextResponse.json(
      { error: "VAPID keys are not configured." },
      { status: 503 },
    );
  }
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 503 },
    );
  }

  const { data: rows, error: rowsError } = await admin
    .from("chronicle_push_subscriptions")
    .select("id, user_id, endpoint, key_p256dh, key_auth, platform, timezone");
  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const byUser = groupByUser<Row>((rows ?? []) as Row[]);
  if (byUser.size === 0) {
    return NextResponse.json({ ok: true, users: 0, sent: 0, skipped: [] });
  }
  const userIds = [...byUser.keys()];

  /**
   * Both lookups are batched. One query per user would turn a few hundred
   * subscribers into a few hundred round trips and blow any serverless time
   * limit long before it finished.
   */
  const [
    { data: states, error: statesError },
    { data: logs, error: logsError },
  ] = await Promise.all([
    admin.from("chronicle_state").select("user_id, data").in("user_id", userIds),
    admin.from("chronicle_push_log").select("user_id, log").in("user_id", userIds),
  ]);

  /**
   * Both errors are fatal, and the log one especially so.
   *
   * Every rate limit — one interruption per subject per day, the per-day cap,
   * one digest per day — lives in `chronicle_push_log`. If it cannot be read, an
   * empty log looks exactly like "nothing has ever been sent", so every run would
   * consider itself the first: on a fifteen-minute schedule that is the same
   * notification every fifteen minutes, indefinitely.
   *
   * These were previously ignored, which made a missing table or a read-only
   * database — Postgres 25006, which a project hitting its disk limit will
   * produce — fail silently in the one direction that spams the user. Refusing
   * to send is the safe failure.
   */
  if (logsError) {
    return NextResponse.json(
      {
        error:
          "Could not read chronicle_push_log, so rate limits cannot be honoured. Refusing to send.",
        detail: logsError.message,
      },
      { status: 500 },
    );
  }
  if (statesError) {
    return NextResponse.json(
      {
        error: "Could not read chronicle_state, so there is nothing to evaluate.",
        detail: statesError.message,
      },
      { status: 500 },
    );
  }

  const snapshots = new Map<string, Snapshot>();
  for (const row of states ?? []) {
    snapshots.set(row.user_id as string, (row.data ?? {}) as Snapshot);
  }
  const logByUser = new Map<string, Partial<DeliveryLog>>();
  for (const row of logs ?? []) {
    logByUser.set(row.user_id as string, (row.log ?? {}) as Partial<DeliveryLog>);
  }

  const at = new Date();
  let sent = 0;
  const skipped: { user: string; reason: string }[] = [];
  const deadEndpoints: string[] = [];
  const logUpserts: { user_id: string; log: DeliveryLog; updated_at: string }[] = [];

  for (const [userId, devices] of byUser) {
    const decision = decideForUser(
      snapshots.get(userId),
      devices,
      logByUser.get(userId),
      at,
    );
    if (!decision.send) {
      skipped.push({ user: userId, reason: decision.reason });
      continue;
    }

    const priority = decision.notices[0]?.priority;
    let deliveredToAny = false;

    for (const device of devices) {
      const payload = payloadForPlatform(decision.payload, device.platform, priority);
      try {
        await webpush.sendNotification(
          {
            endpoint: device.endpoint,
            keys: { p256dh: device.key_p256dh, auth: device.key_auth },
          },
          JSON.stringify(payload),
          {
            // Hold it at the push service for a while if the device is offline;
            // a revision reminder is still worth having an hour later.
            TTL: 3600,
            urgency: priority === "critical" ? "high" : "normal",
          },
        );
        deliveredToAny = true;
        sent++;
      } catch (e) {
        const status = e instanceof WebPushError ? e.statusCode : undefined;
        if (isGoneForever(status)) {
          // The push service says this endpoint no longer exists. Anything else
          // is transient and the row is kept — one bad afternoon should not
          // quietly unsubscribe everybody.
          deadEndpoints.push(device.endpoint);
        }
      }
    }

    /**
     * The log only advances if something actually arrived. Recording a send that
     * failed everywhere would burn the day's cap and the per-subject cooldown on
     * a notification nobody ever saw.
     */
    if (deliveredToAny) {
      logUpserts.push({
        user_id: userId,
        log: decision.nextLog,
        updated_at: at.toISOString(),
      });
    } else {
      skipped.push({ user: userId, reason: "Every device failed." });
    }
  }

  const [logWrite, pruneWrite] = await Promise.all([
    logUpserts.length
      ? admin.from("chronicle_push_log").upsert(logUpserts, { onConflict: "user_id" })
      : Promise.resolve({ error: null }),
    deadEndpoints.length
      ? admin
          .from("chronicle_push_subscriptions")
          .delete()
          .in("endpoint", deadEndpoints)
      : Promise.resolve({ error: null }),
  ]);

  /**
   * A failed log write cannot be undone — the notifications have already gone.
   * But it must not pass quietly: until it succeeds the rate limits are not
   * being recorded, so the next run will send the same thing again. Reporting it
   * as a hard failure is what makes that visible in the cron's own logs instead
   * of only in the user's notification tray.
   */
  if (logWrite.error) {
    return NextResponse.json(
      {
        error:
          "Sent, but could not record the delivery log — rate limits are not persisting, so this will repeat.",
        detail: logWrite.error.message,
        users: byUser.size,
        sent,
        skipped,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    users: byUser.size,
    sent,
    pruned: deadEndpoints.length,
    // Surfaced rather than swallowed: a dead endpoint that cannot be removed
    // will just fail again on every future run.
    pruneFailed: pruneWrite.error ? pruneWrite.error.message : undefined,
    skipped,
  });
}
