import { sameSite } from "@/lib/report-server";
import { errorResponse, json, PlatformError } from "@/lib/platform/server/errors";
import { bearerToken, serviceClient, userRpc } from "@/lib/platform/server/rpc";
import { parseFeedbackSubmission } from "@/lib/platform/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feedback from Help & feedback, the button at the bottom right of the app.
 * Stored through the person's own database function (their token, their
 * account only), straight into the team's Feedback Center in the Admin
 * Center. Nothing is emailed: the team answers in the app. A screenshot goes
 * to the private `platform-feedback` bucket under the person's id.
 */
const ext = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" } as const;

function guard(request: Request): string {
  if (request.method !== "GET" && !sameSite(request)) {
    throw new PlatformError(403, "cross_site", "Messages are accepted from this site's own pages only.");
  }
  const token = bearerToken(request);
  if (!token) throw new PlatformError(401, "unauthorized", "Sign in first.");
  return token;
}

export async function GET(request: Request) {
  try {
    return json({ data: await userRpc(guard(request), "platform_my_feedback") });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Marks the team's responses as read. */
export async function PATCH(request: Request) {
  try {
    return json({ data: await userRpc(guard(request), "platform_mark_feedback_seen") });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const token = guard(request);
    const raw = await request.text();
    if (raw.length > 3_000_000) throw new PlatformError(413, "too_large", "That's too large to send.");
    const parsed = parseFeedbackSubmission(raw ? JSON.parse(raw) : null);
    if (!parsed.ok) throw new PlatformError(400, "invalid", parsed.error);
    const f = parsed.value;

    const item = await userRpc<{ id: string; userId: string } & Record<string, unknown>>(token, "platform_submit_feedback", {
      p_fields: { category: f.category, message: f.message, context: f.context },
    });

    let screenshot: "stored" | "failed" | null = null;
    if (f.screenshot) {
      const path = `${item.userId}/${item.id}.${ext[f.screenshot.type]}`;
      const upload = await serviceClient()
        ?.storage.from("platform-feedback")
        .upload(path, f.screenshot.bytes, { contentType: f.screenshot.type, upsert: false });
      screenshot = upload && !upload.error ? "stored" : "failed";
      if (screenshot === "stored") await userRpc(token, "platform_attach_feedback_screenshot", { p_id: item.id, p_path: path });
      else console.error(`[feedback] screenshot not stored: ${upload?.error?.message ?? "no storage"}`);
    }

    // The account id was only for filing the screenshot.
    const { userId: _userId, ...mine } = item;
    void _userId;
    return json({ data: { ...mine, screenshot } });
  } catch (e) {
    return errorResponse(e);
  }
}
