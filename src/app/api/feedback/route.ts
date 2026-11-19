import { sameSite } from "@/lib/report-server";
import { errorResponse, json, PlatformError } from "@/lib/platform/server/errors";
import { bearerToken, serviceClient, userRpc } from "@/lib/platform/server/rpc";
import { notifyTeam } from "@/lib/platform/server/notify";
import { parseFeedbackSubmission } from "@/lib/platform/validate";
import { FEEDBACK_CATEGORY, type FeedbackCategory } from "@/lib/platform/content";
import { SITE_URL } from "@/lib/seo/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feedback from Settings → Help & feedback. Stored through the person's own
 * database function (their token, their account only), then emailed to the
 * team if email is set up. A screenshot goes to the private
 * `platform-feedback` bucket under the person's id.
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

    const item = await userRpc<{ id: string; userId: string; email: string | null } & Record<string, unknown>>(
      token,
      "platform_submit_feedback",
      { p_fields: { category: f.category, message: f.message, shareEmail: f.shareEmail, context: f.context } },
    );

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

    const label = FEEDBACK_CATEGORY.label[f.category as FeedbackCategory] ?? "Feedback";
    const emailed = await notifyTeam({
      subject: `[DoOrDie] ${label}: ${f.message.replace(/\s+/g, " ").slice(0, 60)}`,
      text: [
        `${label}, sent from DoOrDie.`,
        "",
        `From:       ${item.email ?? "Email not shared"}`,
        `Account:    ${item.userId}`,
        ...(Object.keys(f.context).length ? [`Details:    ${JSON.stringify(f.context)}`] : []),
        ...(screenshot === "stored" ? ["Screenshot: attached in the Admin Center"] : []),
        "",
        f.message,
        "",
        `Answer it in the Admin Center: ${new URL(`/admin/feedback?id=${item.id}`, SITE_URL).toString()}`,
      ].join("\n"),
      replyTo: item.email,
    });

    const { userId: _userId, email: _email, ...mine } = item;
    void _userId;
    void _email;
    return json({ data: { ...mine, screenshot, emailed } });
  } catch (e) {
    return errorResponse(e);
  }
}
