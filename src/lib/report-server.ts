/* ════════════════════════════════════════════════════════════════
   THE CRASH REPORT ROUTE'S WORK
   Checks a crash report, then hands it to the database
   (platform_record_crash), where the team reads it in the Admin Center:
   Feedback → Crash reports. Nothing is emailed. Kept out of
   app/api/report/route.ts so the tests can run it with a stand-in for the
   database and the clock.

   Limits are kept in this server instance's memory: on a serverless host
   each instance counts on its own, so they slow a flood rather than stop
   one exactly. The browser sends at most a handful per tab, and the
   database folds repeats of the same crash into one row and holds at most
   1,000 distinct crashes.
   ════════════════════════════════════════════════════════════════ */

import { LIMITS, parseReport, type CrashReport } from "./report";

export interface ReportDeps {
  /**
   * Stores the report. Throws an error with `status: 503` when this server
   * can't store reports (no service-role key, or the migration hasn't run).
   */
  record: (report: CrashReport) => Promise<void>;
  now: () => number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const RULES = {
  /** Crash reports from one address. */
  perIp: { limit: 6, window: 10 * MINUTE },
  /** Everything this instance stores, so a crash on every page of a busy day can't hammer the database. */
  all: { limit: 300, window: HOUR },
} as const;

const hits = new Map<string, number[]>();

/** Records a hit and says whether it's within `limit` per `window`. */
function allow(key: string, rule: { limit: number; window: number }, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < rule.window);
  if (recent.length >= rule.limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) {
    for (const [k, times] of hits) if (!times.some((t) => now - t < HOUR)) hits.delete(k);
  }
  return true;
}

/** Tests only: forget every count. */
export function resetReportLimits(): void {
  hits.clear();
}

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

/**
 * Only this site's own pages may send. The browser says where a request
 * came from in `Sec-Fetch-Site` (or, in older browsers, `Origin`), and a
 * page on another site can't change either.
 */
export function sameSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || origin === "null" || !host) return false;
  try {
    return new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function handleReport(request: Request, deps: ReportDeps): Promise<Response> {
  if (!sameSite(request)) return json({ error: "Reports are accepted from this site only." }, 403);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LIMITS.body * 4) return json({ error: "That report is too large." }, 413);
  const raw = await request.text().catch(() => "");
  if (raw.length > LIMITS.body) return json({ error: "That report is too large." }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }
  const parsed = parseReport(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const now = deps.now();
  const tooMany = () => json({ error: "Too many reports. Try again later." }, 429, { "Retry-After": "600" });
  if (!allow(`ip:${clientIp(request)}`, RULES.perIp, now) || !allow("all", RULES.all, now)) return tooMany();

  try {
    await deps.record(parsed.report);
  } catch (e) {
    if ((e as { status?: unknown } | null)?.status === 503) return json({ error: "Crash reports aren't set up on this server yet." }, 503);
    console.error("[report] not stored", e instanceof Error ? e.message : e);
    return json({ error: "The report couldn't be stored. Try again later." }, 502);
  }
  return json({ ok: true });
}
