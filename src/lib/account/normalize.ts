import type { Profile } from "../types";
import { toISODate } from "../utils";

/**
 * Brings a profile saved by an older version up to the current shape.
 *
 * The one rule that matters: an account that already has a named profile was
 * set up before first-run setup existed, so it is marked as set up (and keeps
 * the roadmap it always had) instead of being sent through setup again.
 * Idempotent — running it twice changes nothing the second time.
 */
export function normalizeProfile(profile: Profile): Profile {
  if (profile.onboardedAt || !profile.name?.trim()) return profile;
  return {
    ...profile,
    onboardedAt: profile.startDate || toISODate(new Date()),
    useRoadmap: profile.useRoadmap ?? true,
  };
}

/** Applies `normalizeProfile` to a whole or partial snapshot. */
export function normalizeSnapshot<T extends { profile?: Profile }>(snapshot: T): T {
  if (!snapshot.profile) return snapshot;
  const profile = normalizeProfile(snapshot.profile);
  return profile === snapshot.profile ? snapshot : { ...snapshot, profile };
}
