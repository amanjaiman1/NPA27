/* ════════════════════════════════════════════════════════════════
   DEMO MODE
   The interactive demo is the real app, at its real addresses, showing
   the sample account (sample-chronicle.ts) instead of anyone's data.

   It is switched on per browser tab, in sessionStorage: another tab, even
   one signed in to a real account, never sees it, and closing the tab ends
   it. While it is on:

     - no account is active, so nothing the visitor changes is written to
       this browser's storage, and nothing syncs (lib/account/scope.ts);
     - every call that would reach the server with someone's session (the
       platform API, attachments, push, crash reports, account deletion)
       refuses here first, even if a button for it were somehow reached.

   So the demo can't read, change or delete a real account, whether or not
   the person trying it is signed in.
   ════════════════════════════════════════════════════════════════ */

const KEY = "doordie-demo";
/** The guide's place, so a reload or a page change keeps it. */
const STEP_KEY = "doordie-demo-step";

/** Set while the demo session is mounted, for code that runs outside React. */
let mounted = false;

function session(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null; // storage blocked: the demo can't be switched on, which is the safe way round
  }
}

/** Whether this tab is in the demo. */
export function isDemo(): boolean {
  return mounted || session()?.getItem(KEY) === "1";
}

export function enterDemo(): void {
  session()?.setItem(KEY, "1");
  session()?.removeItem(STEP_KEY);
}

export function leaveDemo(): void {
  mounted = false;
  session()?.removeItem(KEY);
  session()?.removeItem(STEP_KEY);
}

/** Called by the demo session as it mounts and unmounts. */
export function markDemoMounted(on: boolean): void {
  mounted = on;
}

export function readDemoStep(): number {
  const n = Number(session()?.getItem(STEP_KEY) ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function saveDemoStep(step: number): void {
  session()?.setItem(STEP_KEY, String(step));
}

export class DemoBlockedError extends Error {
  readonly status = 403;
  constructor(what = "This") {
    super(`${what} isn't available in the demo, where nothing is saved. Create a free account to use it.`);
    this.name = "DemoBlockedError";
  }
}

/** Throws in the demo. For every client call that would use a real session. */
export function assertNotDemo(what?: string): void {
  if (isDemo()) throw new DemoBlockedError(what);
}
