/* ════════════════════════════════════════════════════════════════
   CRASH REPORTS AND FEEDBACK
   What the app sends to the team, and how it becomes an email. Pure, so
   the browser, the server route (app/api/report) and the tests share it.

   A crash report is technical only: the error, its stack, the page (path
   only, never the query), the browser and the time. Never an account id,
   a name, an email or anything the person wrote in the app.

   Feedback comes from a signed-in person. It carries their account id, so
   a problem can be looked into, their email only if they chose to include
   it, and the technical details (browser, screen size, installed or not)
   only if they chose to include those.
   ════════════════════════════════════════════════════════════════ */

/** The Feedback Center's categories (lib/platform/content.ts has the same five). */
export const FEEDBACK_TOPICS = [
  { id: "bug", label: "Bug report" },
  { id: "feature", label: "Feature request" },
  { id: "suggestion", label: "Suggestion" },
  { id: "usability", label: "Hard to use" },
  { id: "general", label: "General feedback" },
] as const;

export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number]["id"];

/** What a tab opened before the categories changed may still send. */
const LEGACY_TOPICS: Record<string, FeedbackTopic> = { problem: "bug", question: "general", other: "general" };

export type CrashSource = "render" | "root" | "window" | "promise";

export interface CrashReport {
  kind: "crash";
  message: string;
  source: CrashSource;
  page: string;
  stack?: string;
  componentStack?: string;
  /** Next.js's id for a server-side error, shown on the error page. */
  digest?: string;
  /** What the person added on the error page, if they did. */
  note?: string;
  userAgent?: string;
  signedIn?: boolean;
  online?: boolean;
  /** When it happened, in the browser (ISO). */
  at?: string;
}

export interface FeedbackReport {
  kind: "feedback";
  topic: FeedbackTopic;
  message: string;
  includeEmail: boolean;
  includeDetails: boolean;
  /** The technical details, kept only when `includeDetails` is true. */
  userAgent?: string;
  /** The window's size in CSS pixels: "390×844". */
  screen?: string;
  /** Running as the installed app rather than in a browser tab. */
  installed?: boolean;
}

export type Report = CrashReport | FeedbackReport;

export const LIMITS = {
  /** The whole request body, in characters. */
  body: 24_000,
  message: 4_000,
  crashMessage: 1_000,
  stack: 6_000,
  note: 2_000,
  page: 300,
  userAgent: 400,
  digest: 120,
} as const;

export const FEEDBACK_MIN_LENGTH = 10;

/** Text without control characters (newlines and tabs kept unless `oneLine`), trimmed and capped. */
export function cleanText(value: unknown, max: number, oneLine = false): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(oneLine ? /[\u0000-\u001f\u007f]+/g : /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, oneLine ? " " : "");
  const text = stripped.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A page as a path only: "/journal/2026-11-19", never "?new=1" or "#data". */
export function cleanPath(value: unknown): string {
  const raw = cleanText(value, LIMITS.page * 2, true);
  if (!raw) return "";
  const path = raw.replace(/^[a-z]+:\/\/[^/]+/i, "").split(/[?#]/)[0] || "/";
  return (path.startsWith("/") ? path : `/${path}`).slice(0, LIMITS.page);
}

const SOURCES: CrashSource[] = ["render", "root", "window", "promise"];

export type ParseResult = { ok: true; report: Report } | { ok: false; error: string };

/** Checks and tidies what arrived. Anything unexpected is dropped, not trusted. */
export function parseReport(input: unknown): ParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Expected a report." };
  const b = input as Record<string, unknown>;
  if (b.kind === "crash") {
    const message = cleanText(b.message, LIMITS.crashMessage);
    if (!message) return { ok: false, error: "A crash report needs the error message." };
    const source = SOURCES.includes(b.source as CrashSource) ? (b.source as CrashSource) : "window";
    const report: CrashReport = { kind: "crash", message, source, page: cleanPath(b.page) || "/" };
    const stack = cleanText(b.stack, LIMITS.stack);
    if (stack) report.stack = stack;
    const componentStack = cleanText(b.componentStack, LIMITS.stack);
    if (componentStack) report.componentStack = componentStack;
    const digest = cleanText(b.digest, LIMITS.digest, true);
    if (digest) report.digest = digest;
    const note = cleanText(b.note, LIMITS.note);
    if (note) report.note = note;
    const userAgent = cleanText(b.userAgent, LIMITS.userAgent, true);
    if (userAgent) report.userAgent = userAgent;
    if (typeof b.signedIn === "boolean") report.signedIn = b.signedIn;
    if (typeof b.online === "boolean") report.online = b.online;
    const at = cleanText(b.at, 40, true);
    if (at && !Number.isNaN(Date.parse(at))) report.at = new Date(at).toISOString();
    return { ok: true, report };
  }
  if (b.kind === "feedback") {
    const topic = FEEDBACK_TOPICS.some((t) => t.id === b.topic)
      ? (b.topic as FeedbackTopic)
      : typeof b.topic === "string"
        ? (LEGACY_TOPICS[b.topic] ?? null)
        : null;
    if (!topic) return { ok: false, error: "Choose what the message is about." };
    const message = cleanText(b.message, LIMITS.message);
    if (message.length < FEEDBACK_MIN_LENGTH) return { ok: false, error: `Write at least ${FEEDBACK_MIN_LENGTH} characters.` };
    const report: FeedbackReport = {
      kind: "feedback",
      topic,
      message,
      includeEmail: b.includeEmail === true,
      includeDetails: b.includeDetails === true,
    };
    if (report.includeDetails) {
      const userAgent = cleanText(b.userAgent, LIMITS.userAgent, true);
      if (userAgent) report.userAgent = userAgent;
      const screen = cleanText(b.screen, 20, true);
      if (/^\d{2,5}×\d{2,5}$/.test(screen)) report.screen = screen;
      if (typeof b.installed === "boolean") report.installed = b.installed;
    }
    return { ok: true, report };
  }
  return { ok: false, error: "Unknown kind of report." };
}

const SOURCE_LABEL: Record<CrashSource, string> = {
  render: "while showing a page",
  root: "in the app's frame (the whole screen failed)",
  window: "in the page's code (an event or a timer)",
  promise: "in a background task that failed",
};

export interface EmailContext {
  /** When the server received it (ISO). */
  receivedAt: string;
  /** The deployed build, if known. */
  build?: string;
  /** Feedback only: who sent it. */
  userId?: string;
  userEmail?: string;
}

export interface EmailParts {
  subject: string;
  text: string;
  replyTo?: string;
}

const row = (label: string, value: string | undefined) => (value ? `${`${label}:`.padEnd(12)}${value}` : null);
const short = (text: string, n: number) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** The email for a report: a plain-text body, so nothing in it can render as markup. */
export function composeEmail(report: Report, ctx: EmailContext): EmailParts {
  if (report.kind === "crash") {
    const lines = [
      "A crash in DoOrDie.",
      "",
      row("Error", report.message),
      row("Page", report.page),
      row("Where", SOURCE_LABEL[report.source]),
      row("When", report.at ?? ctx.receivedAt),
      row("Browser", report.userAgent),
      row("Version", ctx.build),
      row("Signed in", report.signedIn === undefined ? undefined : report.signedIn ? "yes" : "no"),
      row("Online", report.online === undefined ? undefined : report.online ? "yes" : "no"),
      row("Reference", report.digest),
      ...(report.note ? ["", "What the person said happened:", report.note] : []),
      ...(report.stack ? ["", "Stack:", report.stack] : []),
      ...(report.componentStack ? ["", "Component stack:", report.componentStack] : []),
      "",
      "This report holds no account details and nothing the person wrote in the app.",
    ].filter((l): l is string => l !== null);
    const label = report.note ? "Crash (with a note)" : "Crash";
    return { subject: `[DoOrDie] ${label}: ${short(report.message, 80)}`, text: lines.join("\n") };
  }
  const topic = FEEDBACK_TOPICS.find((t) => t.id === report.topic)?.label ?? "Feedback";
  const email = report.includeEmail ? ctx.userEmail : undefined;
  const lines = [
    `${topic}, sent from DoOrDie.`,
    "",
    row("From", email ?? (report.includeEmail ? "No email on the account" : "Email not shared (they chose not to include it)")),
    row("Account", ctx.userId ?? "Not available (this server can't check accounts)"),
    row("Browser", report.userAgent),
    row("Screen", report.screen),
    row("App", report.installed === undefined ? undefined : report.installed ? "installed" : "in a browser tab"),
    row("Version", ctx.build),
    row("Sent", ctx.receivedAt),
    "",
    report.message,
    "",
    email ? "Reply to this email to answer them." : "They didn't share an email, so this can't be answered directly.",
  ].filter((l): l is string => l !== null);
  return { subject: `[DoOrDie] ${topic}: ${short(report.message, 60)}`, text: lines.join("\n"), ...(email ? { replyTo: email } : {}) };
}

/**
 * Errors that aren't the app's to fix: browser extensions, cancelled
 * requests, a connection that dropped, and the browser's own resize-loop
 * notice. Reporting them would only bury the real ones.
 */
export function isNoise(message: string, stack = ""): boolean {
  // A script from another site that failed: the browser hides everything but this.
  if (/^\s*Script error\.?\s*$/i.test(message)) return true;
  return /ResizeObserver loop|chrome-extension:\/\/|moz-extension:\/\/|safari(-web)?-extension:\/\/|AbortError|The operation was aborted|NetworkError|Failed to fetch|Load failed|ChunkLoadError|Loading chunk [\w-]+ failed|Non-Error promise rejection captured/i.test(
    `${message}\n${stack}`,
  );
}
