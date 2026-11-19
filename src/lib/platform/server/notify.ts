import { DEFAULT_FROM, RESEND_ENDPOINT } from "@/lib/report-server";

/**
 * Emails the team, if email is set up (RESEND_API_KEY and REPORTS_TO_EMAIL,
 * the same variables as crash reports). Plain text only. Returns whether it
 * went; a failure is logged, never thrown, because the message it
 * announces is already stored.
 */
export async function notifyTeam(email: { subject: string; text: string; replyTo?: string | null }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.REPORTS_TO_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!apiKey || !to.length) return false;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.REPORTS_FROM_EMAIL?.trim() || DEFAULT_FROM,
        to,
        subject: email.subject,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        tags: [{ name: "kind", value: "feedback" }],
      }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) console.error(`[feedback] Resend answered ${res.status}`);
    return res.ok;
  } catch {
    console.error("[feedback] Resend didn't answer");
    return false;
  }
}
