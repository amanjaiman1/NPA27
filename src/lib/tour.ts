import type { Profile } from "./types";
import { daysBetween, toISODate } from "./utils";

/* ════════════════════════════════════════════════════════════════
   THE FEATURE TOUR — when it opens by itself
   Pure, so it can be reasoned about without a browser. The tour itself
   is components/tour/; this only decides whether to show it unasked.
   ════════════════════════════════════════════════════════════════ */

/**
 * How long after setup an account still counts as new. The tour opens by
 * itself on the first visit to the dashboard, which is normally seconds after
 * setup; the margin covers someone who sets up, closes the app at the morning
 * check-in, and comes back days later.
 */
export const TOUR_NEW_ACCOUNT_DAYS = 7;

/**
 * Whether the tour should open without being asked: only for an account set
 * up in the last week that has never seen it. An account that has been in
 * use for longer is never interrupted; its tour button shows a dot instead.
 */
export function shouldAutoOpenTour(
  profile: Pick<Profile, "onboardedAt" | "tourSeenAt">,
  today: string = toISODate(new Date()),
): boolean {
  if (profile.tourSeenAt || !profile.onboardedAt) return false;
  const age = daysBetween(profile.onboardedAt, today);
  return age >= 0 && age <= TOUR_NEW_ACCOUNT_DAYS;
}
