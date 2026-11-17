import type { Profile } from "../types";
import { toISODate } from "../utils";
import { DEFAULT_WALLPAPER, isWallpaper, wallpaperMeta } from "../wallpaper";

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

/**
 * A wallpaper this version no longer offers becomes plain, with plain's dim.
 * The one retired so far is `custom`, the user's own photo, removed to save
 * storage; a device on an older version can still send it.
 */
export function normalizeWallpaper<T extends { wallpaper?: unknown; wallpaperDim?: unknown }>(
  snapshot: T,
): T {
  if (snapshot.wallpaper === undefined || isWallpaper(snapshot.wallpaper)) return snapshot;
  return {
    ...snapshot,
    wallpaper: DEFAULT_WALLPAPER,
    wallpaperDim: wallpaperMeta(DEFAULT_WALLPAPER).dim,
  };
}

/** Applies `normalizeProfile` and `normalizeWallpaper` to a whole or partial snapshot. */
export function normalizeSnapshot<
  T extends { profile?: Profile; wallpaper?: unknown; wallpaperDim?: unknown },
>(snapshot: T): T {
  const next = normalizeWallpaper(snapshot);
  if (!next.profile) return next;
  const profile = normalizeProfile(next.profile);
  return profile === next.profile ? next : { ...next, profile };
}
