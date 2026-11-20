/* ════════════════════════════════════════════════════════════════
   CRASH REPORTS, AND THE FEEDBACK FORM'S TOPICS
   What a crash report holds, and how the server checks one. Pure, so the
   browser, the server route (app/api/report) and the tests share it.

   A crash report is technical only: the error, its stack, the page (path
   only, never the query), the browser and the time. Never an account id,
   a name, an email or anything the person wrote in the app. It goes to the
   team's Admin Center (Feedback → Crash reports), never by email.

   Messages to the team (bug reports, ideas, questions) don't come through
   here: Help & feedback sends them to the Feedback Center, through
   app/api/feedback, as the signed-in person.
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

export type Report = CrashReport;

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
  // Messages went this way before they had the Feedback Center. A tab still open from then gets a clear answer.
  if (b.kind === "feedback") return { ok: false, error: "Messages go to the team from Help & feedback in the app now." };
  return { ok: false, error: "Unknown kind of report." };
}

/** Where in the app it failed, for the Admin Center. */
export const CRASH_SOURCE_LABEL: Record<CrashSource, string> = {
  render: "While showing a page",
  root: "In the app's frame (the whole screen failed)",
  window: "In the page's code (an event or a timer)",
  promise: "In a background task",
};

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
