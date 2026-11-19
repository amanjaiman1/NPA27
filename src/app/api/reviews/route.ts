import { revalidateTag } from "next/cache";
import { sameSite } from "@/lib/report-server";
import { errorResponse, json, PlatformError } from "@/lib/platform/server/errors";
import { bearerToken, userRpc } from "@/lib/platform/server/rpc";
import { PUBLIC_TAGS } from "@/lib/platform/server/admin-api";
import { parseReviewFields } from "@/lib/platform/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in person's own review: read it with their eligibility, send or
 * edit it, change whether it may be public, withdraw or delete it. Every call
 * runs the database's own function with the person's token, so it can only
 * ever touch their review. Changes refresh the public pages at once.
 */
async function run(request: Request, fn: string, args: Record<string, unknown>, refresh: boolean) {
  try {
    if (request.method !== "GET" && !sameSite(request)) {
      throw new PlatformError(403, "cross_site", "Changes are accepted from this site's own pages only.");
    }
    const token = bearerToken(request);
    if (!token) throw new PlatformError(401, "unauthorized", "Sign in first.");
    const data = await userRpc(token, fn, args);
    if (refresh) revalidateTag(PUBLIC_TAGS.testimonials);
    return json({ data });
  } catch (e) {
    return errorResponse(e);
  }
}

export const GET = (request: Request) => run(request, "platform_my_review", {}, false);

export async function POST(request: Request) {
  const fields = parseReviewFields(await request.json().catch(() => null));
  if (!fields.ok) return json({ error: fields.error, code: "invalid" }, 400);
  return run(request, "platform_submit_review", { p_fields: fields.value }, true);
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as { publicConsent?: unknown; consentVersion?: unknown } | null;
  if (typeof body?.publicConsent !== "boolean") return json({ error: "Say whether it may be public.", code: "invalid" }, 400);
  const version = typeof body.consentVersion === "string" ? body.consentVersion.slice(0, 20) : null;
  return run(request, "platform_set_review_consent", { p_public: body.publicConsent, p_version: version }, true);
}

export async function DELETE(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode !== "withdraw" && mode !== "delete") return json({ error: "Withdraw or delete?", code: "invalid" }, 400);
  return run(request, mode === "withdraw" ? "platform_withdraw_review" : "platform_delete_my_review", {}, true);
}
