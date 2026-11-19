import { adminClient } from "@/lib/supabase-admin";
import { handleReport, type Caller } from "@/lib/report-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Crash reports and messages to the team, sent on as email (lib/report-server.ts).
 *
 * A message is tied to the account in the verified bearer token, never to
 * an id or an address in the body, so nobody can write in someone else's
 * name. Crash reports need no account: they can come from the sign-in
 * screens, and they carry nothing about the person.
 */
export async function POST(request: Request) {
  const admin = adminClient();
  const identify = admin
    ? async (authorisation: string | null): Promise<Caller | null> => {
        const token = authorisation?.replace(/^Bearer\s+/i, "").trim();
        if (!token) return null;
        const { data, error } = await admin.auth.getUser(token);
        if (error || !data.user) return null;
        return { id: data.user.id, email: data.user.email ?? undefined };
      }
    : undefined;

  return handleReport(request, {
    env: {
      apiKey: process.env.RESEND_API_KEY,
      to: process.env.REPORTS_TO_EMAIL,
      from: process.env.REPORTS_FROM_EMAIL,
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    },
    send: fetch,
    now: Date.now,
    identify,
  });
}
