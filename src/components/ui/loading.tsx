import { cn } from "@/lib/utils";
import { Lottie } from "./lottie";

/**
 * The two waits in this app are different events and get different animations —
 * but each wait shows exactly one animation, never a hand-off between two.
 *
 *  1. `BootRing` / `Loading` — a browser refresh or cold start. Pure CSS, and it
 *     has to be: that wait *ends* at hydration, so a JavaScript player cannot
 *     start until the wait is already over. The ring is in the server-rendered
 *     HTML and is turning before any JavaScript has run.
 *
 *  2. `PageLoading` — moving between pages. The real Lottie, since by then the
 *     app is running. Desktop only; see below.
 */

/**
 * The cold-start ring: a reproduction of `public/loading (1).lottie` as a masked
 * conic gradient. `.boot-ring` lives in `globals.css`.
 */
export function BootRing({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading the Chronicle"
      className={cn("boot-ring block h-[4.5rem] w-[4.5rem]", className)}
    />
  );
}

/** Cold start / refresh, centred in the content area. */
export function Loading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <BootRing />
    </div>
  );
}

/**
 * Page to page: the three dots from `public/loading (2).lottie`.
 *
 * Hidden below `lg`, deliberately. On a phone this indicator did more harm than
 * good — a slow device plus a real chunk fetch left it on screen long enough to
 * read as a hang, which is worse than the brief unannounced pause it replaced.
 * The same cut-off is applied to `RouteTransition`, so a phone never shows a
 * page-to-page animation from either path.
 *
 * `hidden lg:grid` rather than a JS width check: a media query costs no
 * hydration and cannot disagree with the server.
 */
export function PageLoading() {
  return (
    <div className="hidden min-h-[60dvh] place-items-center lg:grid">
      <Lottie
        src="/animations/page-transition.json"
        className="lottie-neutral h-16 w-16"
        staticFrame={8}
        label="Loading page"
      />
    </div>
  );
}
