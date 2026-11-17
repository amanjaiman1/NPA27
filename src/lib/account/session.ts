"use client";

/* ════════════════════════════════════════════════════════════════
   LOADING AND UNLOADING AN ACCOUNT IN THIS TAB
   The order of operations here is the isolation guarantee:

     activate:   point storage at the account → blank the store in memory
                 (writes still off, so the blank never reaches disk) → turn
                 writes on → read the account's saved state.
     deactivate: turn writes off and detach storage first → only then blank
                 the store and reset the look.

   So at no point can one account's state be written under another's key,
   and nothing of the previous account is left in memory.
   ════════════════════════════════════════════════════════════════ */

import { useChronicle, blankChronicleState } from "../store";
import type { MergeConflict } from "../sync/merge";
import { clearBaseStore } from "../sync/base-store";
import { DEFAULT_PALETTE, DEFAULT_THEME_MODE, applyThemeMode } from "../theme";
import { DEFAULT_WALLPAPER, deleteWallpaperPhotos } from "../wallpaper";
import {
  STORE_KEY,
  enableWrites,
  eraseAccountKeys,
  readKey,
  removeKey,
  setActiveAccount,
  withoutWrites,
  writeKey,
} from "./scope";
import { claimLegacyData, eraseLegacyMarker, type LegacyClaim } from "./legacy";

export type AccountMode = "cloud" | "local";

export interface Activation {
  accountId: string;
  /** Pre-account data moved into this account on this load, if any. */
  legacy: LegacyClaim | null;
  /**
   * True when this browser holds nothing of the account worth keeping: it has
   * never completed a sync here and inherited no old data.
   */
  pristine: boolean;
}

const readyKey = (id: string) => `upsc-chronicle-ready:${id}`;
const conflictsKey = (id: string) => `upsc-chronicle-conflicts:${id}`;
const MAX_CONFLICTS = 30;

export async function activateAccount(accountId: string, mode: AccountMode): Promise<Activation> {
  deactivateAccount();

  const legacy = claimLegacyData(accountId, mode);
  deleteWallpaperPhotos();
  const pristine =
    mode === "cloud" ? readKey(readyKey(accountId)) !== "1" && !legacy : false;

  setActiveAccount(accountId);
  useChronicle.setState(blankChronicleState());
  enableWrites();
  await useChronicle.persist.rehydrate();
  return { accountId, legacy, pristine };
}

export function deactivateAccount(): void {
  setActiveAccount(null);
  useChronicle.setState(blankChronicleState());
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    applyThemeMode(DEFAULT_THEME_MODE);
    root.setAttribute("data-palette", DEFAULT_PALETTE);
    root.setAttribute("data-wallpaper", DEFAULT_WALLPAPER);
    root.style.setProperty("--wp-dim", "0");
  }
}

/** Records that this browser has completed a sync for the account. */
export function markDeviceReady(accountId: string): void {
  writeKey(readyKey(accountId), "1");
}

export function isDeviceReady(accountId: string): boolean {
  return readKey(readyKey(accountId)) === "1";
}

/** Re-reads the account's state after another tab saved it, without echoing a write. */
export function reloadFromStorage(): void {
  withoutWrites(() => {
    void useChronicle.persist.rehydrate();
  });
}

/** The storage key another tab writes when it saves this account. */
export function storeKeyFor(accountId: string): string {
  return `${STORE_KEY}:${accountId}`;
}

/** Removes everything this browser holds for the account. */
export async function eraseAccountFromDevice(accountId: string): Promise<void> {
  eraseAccountKeys(accountId);
  eraseLegacyMarker(accountId);
  await clearBaseStore(accountId);
}

/* ── the record of edits that clashed between devices ──────────── */

export interface ConflictRecord extends MergeConflict {
  at: string;
}

export function readConflicts(accountId: string): ConflictRecord[] {
  try {
    const raw = readKey(conflictsKey(accountId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ConflictRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordConflicts(accountId: string, conflicts: MergeConflict[]): ConflictRecord[] {
  const at = new Date().toISOString();
  const next = [...conflicts.map((c) => ({ ...c, at })), ...readConflicts(accountId)].slice(
    0,
    MAX_CONFLICTS,
  );
  writeKey(conflictsKey(accountId), JSON.stringify(next));
  return next;
}

export function clearConflicts(accountId: string): void {
  removeKey(conflictsKey(accountId));
}
