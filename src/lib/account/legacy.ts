/* ════════════════════════════════════════════════════════════════
   DATA FROM BEFORE ACCOUNTS
   Older versions kept everything under one unscoped key. That data is
   moved into an account's own namespace exactly once, and only into the
   account it provably belongs to: the one that last synced it from this
   browser, which the old app recorded under
   `upsc-chronicle-cloud-synced:<user id>`. Nobody else ever receives it.

   The original key is kept until the first sync after the move succeeds,
   so a failure part-way through loses nothing and simply retries.
   ════════════════════════════════════════════════════════════════ */

import {
  LEGACY_STORE_KEY,
  STORE_KEY,
  allKeys,
  readKey,
  removeKey,
  writeKey,
} from "./scope";

const MARKER_PREFIX = "upsc-chronicle-cloud-synced:";
const CLAIM_PREFIX = "upsc-chronicle-legacy-claim:";

/** Versions older than this were reset by the old app on load anyway. */
const OLDEST_KEPT_VERSION = 6;

export interface LegacyClaim {
  /** When this browser last synced the data under the old scheme. */
  syncedAt: string | null;
}

function legacyBlobUsable(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { state?: unknown; version?: unknown };
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.state === "object" &&
      typeof parsed.version === "number" &&
      parsed.version >= OLDEST_KEPT_VERSION
    );
  } catch {
    return false;
  }
}

/** The account whose old sync marker is the most recent, if any. */
function newestMarkedAccount(): { id: string; syncedAt: string } | null {
  let best: { id: string; syncedAt: string; at: number } | null = null;
  for (const key of allKeys()) {
    if (!key.startsWith(MARKER_PREFIX)) continue;
    const syncedAt = readKey(key);
    const at = syncedAt ? Date.parse(syncedAt) : NaN;
    if (!syncedAt || !Number.isFinite(at)) continue;
    if (!best || at > best.at) best = { id: key.slice(MARKER_PREFIX.length), syncedAt, at };
  }
  return best ? { id: best.id, syncedAt: best.syncedAt } : null;
}

/**
 * Moves pre-account data into `accountId`'s namespace when it belongs there.
 *
 * - Cloud mode: only for the account that last synced it from this browser.
 *   Returns the claim, which the first sync uses to decide whose copy is newer.
 * - Local mode (no cloud configured): there is only ever one user, so the data
 *   simply moves; nothing to reconcile.
 */
export function claimLegacyData(accountId: string, mode: "cloud" | "local"): LegacyClaim | null {
  const target = `${STORE_KEY}:${accountId}`;
  const pending = readKey(`${CLAIM_PREFIX}${accountId}`);
  // A move that already happened but hasn't been confirmed by a sync yet.
  if (pending != null && readKey(target) != null) return { syncedAt: pending || null };

  const raw = readKey(LEGACY_STORE_KEY);
  if (!legacyBlobUsable(raw)) return null;

  if (mode === "local") {
    if (readKey(target) == null && writeKey(target, raw as string)) removeKey(LEGACY_STORE_KEY);
    return null;
  }

  const owner = newestMarkedAccount();
  if (!owner || owner.id !== accountId) return null;
  if (readKey(target) == null && !writeKey(target, raw as string)) return null;
  writeKey(`${CLAIM_PREFIX}${accountId}`, owner.syncedAt);
  return { syncedAt: owner.syncedAt };
}

/** Called once the first sync after a move succeeded: the old copy can go. */
export function settleLegacyClaim(accountId: string): void {
  removeKey(LEGACY_STORE_KEY);
  removeKey(`${CLAIM_PREFIX}${accountId}`);
  for (const key of allKeys()) if (key.startsWith(MARKER_PREFIX)) removeKey(key);
}

/** Old per-account sync markers, removed with the account's other keys. */
export function eraseLegacyMarker(accountId: string): void {
  removeKey(`${MARKER_PREFIX}${accountId}`);
}
