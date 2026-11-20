import { sameSite } from "@/lib/report-server";
import { errorResponse, PlatformError } from "@/lib/platform/server/errors";
import { userRpc } from "@/lib/platform/server/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Left the site", for Admin → Users' Last visit
 * (supabase/migrations/20261215120000_presence.sql).
 *
 * The one presence report that can't go straight to the database: it's sent
 * as a tab closes or goes off screen, with `navigator.sendBeacon`, the one
 * request browsers reliably finish after a page has gone. A beacon can't
 * carry an Authorization header, and a request to another site with one has
 * to be checked first (a CORS preflight) that a closing tab may not wait for.
 * So it comes here, from this site's own pages only, with the session's
 * token in the body, and goes on as the person's own call: their token,
 * their account only, checked by the database.
 */
const MAX_BODY = 8_192;

export async function POST(request: Request) {
  try {
    if (!sameSite(request)) throw new PlatformError(403, "cross_site", "Reports are accepted from this site's own pages only.");
    const text = await request.text();
    if (text.length > MAX_BODY) throw new PlatformError(413, "too_large", "That report is too large.");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new PlatformError(400, "invalid", "That isn't a presence report.");
    }
    const { token, tab, seq } = body ?? {};
    if (
      typeof token !== "string" ||
      !token ||
      typeof tab !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(tab) ||
      typeof seq !== "number" ||
      !Number.isSafeInteger(seq) ||
      seq < 0
    ) {
      throw new PlatformError(400, "invalid", "That isn't a presence report.");
    }
    await userRpc(token, "platform_mark_presence", { p_state: "left", p_tab: tab, p_seq: seq });
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
