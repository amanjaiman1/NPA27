/* ════════════════════════════════════════════════════════════════
   THE REPORT ROUTE'S WORK
   Checks a crash report or a message, then emails it to the team through
   Resend's HTTP API. Kept out of app/api/report/route.ts so the tests can
   run it with a stand-in for the network, the clock and the account check.

   The address it goes to lives only in the server's environment
   (REPORTS_TO_EMAIL). It is never sent to the browser or shown on the site.

   Limits are kept in this server instance's memory: on a serverless host
   each instance counts on its own, so they slow a flood rather than stop
   one exactly. The browser sends at most a handful per tab, and Resend's
   own daily cap is the backstop.
   ════════════════════════════════════════════════════════════════ */

import { LIMITS, composeEmail, parseReport } from "./report";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** Resend's shared test sender. It only delivers to the Resend account's own address. */
export const DEFAULT_FROM = "DoOrDie reports <onboarding@resend.dev>";

export interface ReportEnv {
  apiKey?: string;
  /** One address, or several separated by commas. */
  to?: string;
  from?: string;
  /** The deployed build, shown in the email. */
  build?: string;
}

export interface Caller {
  id: string;
  email?: string;
}

export interface ReportDeps {
  env: ReportEnv;
  send: typeof fetch;
  now: () => number;
  /**
   * Resolves the request's bearer token to an account. Absent when this
   * server can't check accounts (no service-role key): messages are then
   * accepted without one.
   */
  identify?: (authorisation: string | null) => Promise<Caller | null>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const RULES = {
  /** Crash reports from one address. */
  crashPerIp: { limit: 6, window: 10 * MINUTE },
  /** Messages from one account, and from one address. */
  feedbackPerUser: { limit: 5, window: HOUR },
  feedbackPerIp: { limit: 10, window: HOUR },
  /** Every email this instance sends, so a crash on every page can't use up the day's quota. */
  all: { limit: 40, window: HOUR },
  /** The same crash on the same page is emailed once an hour. */
  sameCrash: { limit: 1, window: HOUR },
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

/** Takes back the latest hit, for an email that didn't go out after all. */
function forget(key: string): void {
  hits.get(key)?.pop();
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
  const report = parsed.report;

  const to = (deps.env.to ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!deps.env.apiKey || to.length === 0) {
    return json({ error: "Reports aren't set up on this server yet." }, 503);
  }

  const now = deps.now();
  const ip = clientIp(request);
  const tooMany = () => json({ error: "Too many reports. Try again later." }, 429, { "Retry-After": "600" });

  let caller: Caller | null = null;
  if (report.kind === "feedback") {
    if (deps.identify) {
      caller = await deps.identify(request.headers.get("authorization"));
      if (!caller) return json({ error: "Sign in again, then send it." }, 401);
      if (!allow(`feedback:user:${caller.id}`, RULES.feedbackPerUser, now)) return tooMany();
    }
    if (!allow(`feedback:ip:${ip}`, RULES.feedbackPerIp, now)) return tooMany();
  }
  // A note is the person asking; only the automatic copies are folded together.
  const sameKey = report.kind === "crash" && !report.note ? `crash:same:${report.message}|${report.page}` : null;
  if (report.kind === "crash") {
    if (!allow(`crash:ip:${ip}`, RULES.crashPerIp, now)) return tooMany();
    if (sameKey && !allow(sameKey, RULES.sameCrash, now)) return json({ ok: true, skipped: "already reported" });
  }
  if (!allow("all", RULES.all, now)) {
    if (sameKey) forget(sameKey);
    return tooMany();
  }
  const failed = (message: string) => {
    // Not sent, so the same crash may be tried again.
    if (sameKey) forget(sameKey);
    return json({ error: message }, 502);
  };

  const email = composeEmail(report, {
    receivedAt: new Date(now).toISOString(),
    build: deps.env.build,
    userId: caller?.id,
    userEmail: caller?.email,
  });

  let res: Response;
  try {
    res = await deps.send(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.env.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: deps.env.from?.trim() || DEFAULT_FROM,
        to,
        subject: email.subject,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        tags: [{ name: "kind", value: report.kind }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return failed("The email service didn't answer. Try again in a minute.");
  }
  if (!res.ok) {
    // Resend's reason goes to the server log, not to the browser.
    const reason = await res.text().catch(() => "");
    console.error(`[report] Resend answered ${res.status}: ${reason.slice(0, 300)}`);
    return failed("The email service turned it down. Try again later.");
  }
  return json({ ok: true });
}
