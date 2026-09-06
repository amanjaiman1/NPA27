import { Lottie, LottieWithFallback } from "./lottie";

/**
 * The two waits in this app are different events and get different animations.
 *
 *  1. `Loading` — a browser refresh or cold start. The whole app is booting:
 *     the bundle is downloading and the store has not hydrated yet. Every page
 *     renders this while `!hydrated`. The gradient ring is the loud one, because
 *     this is the wait that can actually last.
 *
 *  2. `PageLoading` — moving between pages. Rendered from `app/loading.tsx`,
 *     which Next shows the moment a route transition begins and removes only
 *     once the next page is ready to paint. Three quiet dots; a page change is
 *     not an event worth a fanfare.
 */

/** Cold start / refresh: the gradient ring, from `public/loading (1).lottie`. */
export function Loading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <LottieWithFallback
        src="/animations/boot.json"
        className="h-24 w-24"
        fallbackClassName="boot-ring h-[4.5rem] w-[4.5rem]"
        staticFrame={18}
        label="Loading the Chronicle"
      />
    </div>
  );
}

/**
 * Page to page: the three dots, from `public/loading (2).lottie`.
 *
 * No CSS stand-in here — by the time you can navigate, the player is already
 * warm, and the dots are deliberately quiet enough that a placeholder swap
 * would be more noticeable than the wait.
 */
export function PageLoading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <Lottie
        src="/animations/page-transition.json"
        className="lottie-neutral h-16 w-16"
        staticFrame={8}
        label="Loading page"
      />
    </div>
  );
}
