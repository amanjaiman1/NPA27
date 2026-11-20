import { handleReport } from "@/lib/report-server";
import { serviceRpc } from "@/lib/platform/server/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Crash reports, kept for the team in the Admin Center (Feedback → Crash
 * reports) through the database's platform_record_crash, which only the
 * server may call. They need no account: they can come from the sign-in
 * screens, and they carry nothing about the person. Nothing is emailed.
 */
export async function POST(request: Request) {
  return handleReport(request, {
    record: async (report) => {
      await serviceRpc("platform_record_crash", {
        p_report: { ...report, build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
      });
    },
    now: Date.now,
  });
}
