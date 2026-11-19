/* ════════════════════════════════════════════════════════════════
   SENDING A CRASH REPORT FROM THE BROWSER
   Used by the error screens and by the listener for errors no screen
   caught. It doesn't import the store or the account code: the root error
   screen, which stands in for the whole site, loads with every public page,
   and those pages must stay free of both.

   Whether reports may go on their own is the account's choice (Settings →
   Help & feedback). The app hands this module a way to read it
   (`setCrashConsentSource`, in components/feedback/crash-reporter.tsx).
   Where the choice can't be read (a public page, or nothing saved in this
   browser yet), a signed-in person is asked instead of reported on.

   What goes out is described in lib/report.ts: the error and the page's
   path, never an account, a name or anything written in the app.
   ════════════════════════════════════════════════════════════════ */

import { LIMITS, cleanPath, isNoise, type CrashReport, type CrashSource } from "./report";

const ENDPOINT = "/api/report";
/** This tab's sent reports, kept across reloads so a page that fails as it loads can't send one per reload. */
const SESSION_KEY = "doordie-crash-reports";
/** Automatic reports per tab. The ones a person sends themselves count separately. */
const AUTO_CAP = 5;
const ASKED_CAP = 3;

/**
 * - `sent`: it went.
 * - `off`: the account switched automatic reports off.
 * - `ask`: someone is signed in but their choice can't be read here, so nothing went on its own.
 * - `skipped`: not worth sending (not the app's fault, already sent, too many, or local development).
 * - `unavailable`: the server has no email set up.
 * - `failed`: the network or the email service failed.
 */
export type SendResult = "sent" | "off" | "ask" | "skipped" | "unavailable" | "failed";

let consentSource: (() => boolean | null) | null = null;

/**
 * How to read the account's choice: true or false when it's known, null
 * when it isn't. Read at the moment of each report, so it's never a step
 * behind the app.
 */
export function setCrashConsentSource(read: (() => boolean | null) | null): void {
  consentSource = read;
}

function accountChoice(): boolean | null {
  try {
    return consentSource?.() ?? null;
  } catch {
    return null;
  }
}

/** Whether a session is saved in this browser. Read from storage, so it works before the app loads. */
export function signedInHere(): boolean {
  try {
    const session = JSON.parse(localStorage.getItem("upsc-chronicle-auth") ?? "null") as { user?: { id?: unknown } } | null;
    return typeof session?.user?.id === "string";
  } catch {
    return false;
  }
}

/**
 * Yes when the account allows reports, or nobody is signed in here (nobody
 * has said no, and a report holds nothing about the person). No when the
 * account switched them off. Ask when someone is signed in but their
 * choice can't be read.
 */
export function crashReportConsent(): "yes" | "no" | "ask" {
  const choice = accountChoice();
  if (choice !== null) return choice ? "yes" : "no";
  return signedInHere() ? "ask" : "yes";
}

interface Sent {
  keys: string[];
  auto: number;
  asked: number;
}

function readSent(): Sent {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Partial<Sent> | null;
    return {
      keys: Array.isArray(raw?.keys) ? raw.keys.filter((k): k is string => typeof k === "string") : [],
      auto: typeof raw?.auto === "number" ? raw.auto : 0,
      asked: typeof raw?.asked === "number" ? raw.asked : 0,
    };
  } catch {
    return { keys: [], auto: 0, asked: 0 };
  }
}

function writeSent(sent: Sent): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...sent, keys: sent.keys.slice(-20) }));
  } catch {
    /* storage off: nothing to remember it in */
  }
}

/** "TypeError: x is undefined", or the best that can be said about something that isn't an Error. */
export function errorText(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    const name = error.name && error.name !== "Error" ? `${error.name}: ` : "";
    return { message: `${name}${error.message || "(no message)"}`, stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  return { message: "An error with no message" };
}

export interface CrashInput {
  error: unknown;
  source: CrashSource;
  componentStack?: string;
  digest?: string;
  note?: string;
}

function buildReport({ error, source, componentStack, digest, note }: CrashInput): CrashReport {
  const { message, stack } = errorText(error);
  return {
    kind: "crash",
    message: message.slice(0, LIMITS.crashMessage),
    source,
    page: cleanPath(window.location.pathname) || "/",
    ...(stack ? { stack: stack.slice(0, LIMITS.stack) } : {}),
    ...(componentStack ? { componentStack: componentStack.slice(0, LIMITS.stack) } : {}),
    ...(digest ? { digest } : {}),
    ...(note ? { note: note.slice(0, LIMITS.note) } : {}),
    userAgent: navigator.userAgent.slice(0, LIMITS.userAgent),
    signedIn: signedInHere(),
    online: navigator.onLine,
    at: new Date().toISOString(),
  };
}

async function post(report: CrashReport): Promise<SendResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      credentials: "same-origin",
      // Still delivered if the person closes the tab or the page reloads.
      keepalive: true,
    });
    if (res.ok) return "sent";
    return res.status === 503 ? "unavailable" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Sends a crash report on its own, if that's allowed (see
 * `crashReportConsent`). Skips what isn't the app's fault (`isNoise`), a
 * crash this tab already reported, anything past a handful per tab, and
 * local development, where the error overlay already shows it.
 */
export async function reportCrash(input: CrashInput): Promise<SendResult> {
  if (typeof window === "undefined") return "skipped";
  if (process.env.NODE_ENV !== "production") return "skipped";
  const consent = crashReportConsent();
  if (consent === "no") return "off";
  const report = buildReport(input);
  if (isNoise(report.message, report.stack)) return "skipped";
  if (consent === "ask") return "ask";
  const sent = readSent();
  const key = `${report.message}|${report.page}`;
  if (sent.keys.includes(key) || sent.auto >= AUTO_CAP) return "skipped";
  writeSent({ ...sent, keys: [...sent.keys, key], auto: sent.auto + 1 });
  return post(report);
}

/**
 * Sends a crash report because the person asked: with a note about what
 * happened, or from a "Send a crash report" button. It goes even with
 * automatic reports off, since they chose to send this one.
 */
export async function sendCrashReport(input: CrashInput): Promise<SendResult> {
  if (typeof window === "undefined") return "skipped";
  const sent = readSent();
  if (sent.asked >= ASKED_CAP) return "skipped";
  writeSent({ ...sent, asked: sent.asked + 1 });
  return post(buildReport(input));
}
