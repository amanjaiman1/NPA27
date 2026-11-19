import { cn } from "@/lib/utils";

/**
 * The two waits in this app are different events and get different
 * animations, both drawn by CSS so they are on screen the moment the wait
 * begins, with nothing to download or start first.
 *
 *  1. `BootRing` / `Loading` — a browser refresh or cold start. It has to be
 *     CSS: that wait *ends* at hydration, so a JavaScript player could not
 *     start until the wait was already over. The ring is in the
 *     server-rendered HTML and is turning before any JavaScript has run.
 *
 *  2. `PageLoading` — moving between pages, when the next page isn't ready.
 *     Three dots. They used to be a Lottie animation, which had to fetch its
 *     player and its data before it could appear, so on a slow connection it
 *     showed up late, if at all, and spent the wait it was covering on itself.
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
 * Page to page: the three dots from `public/loading (2).lottie`, drawn by CSS
 * (`.loading-dots` in `globals.css`).
 *
 * Hidden below `lg`, deliberately. On a phone a loader in the middle of the
 * screen read as a hang on a slow connection; the progress bar along the top
 * (`RouteTransition`) says "on its way" there instead.
 *
 * `hidden lg:grid` rather than a JS width check: a media query costs no
 * hydration and cannot disagree with the server.
 */
export function PageLoading() {
  return (
    <div className="hidden min-h-[60dvh] place-items-center lg:grid">
      <span className="loading-dots" role="status" aria-label="Loading page">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
