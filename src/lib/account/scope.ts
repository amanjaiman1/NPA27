/* ════════════════════════════════════════════════════════════════
   ONE BROWSER, MANY ACCOUNTS
   Everything an account keeps in this browser lives under keys suffixed
   with its id: `upsc-chronicle-store:<id>` and friends. Exactly one
   account is "active" at a time, and only while it is active can its keys
   be read or written. With no active account every read returns nothing
   and every write is dropped, so a sign-out, a switch, or a page still
   resolving its session can never leak one person's data into another's.

   The storage backend is injectable so the rules can be tested in Node.
   ════════════════════════════════════════════════════════════════ */

import type { StateStorage } from "zustand/middleware";

/** The persisted store, before the account suffix. */
export const STORE_KEY = "upsc-chronicle-store";
/** The single, unscoped key every version before accounts used. */
export const LEGACY_STORE_KEY = STORE_KEY;
/** Account id used when cloud sync isn't configured (one local user). */
export const LOCAL_ACCOUNT_ID = "local";

/** Keys a full sign-out removes, besides the store itself. */
export const ACCOUNT_KEY_PREFIXES = [
  "upsc-chronicle-conflicts",
  "upsc-chronicle-ready",
  "upsc-chronicle-legacy-claim",
  "upsc-chronicle-surface",
  "upsc-chronicle-palette",
  "upsc-chronicle-wallpaper",
  "upsc-chronicle-wallpaper-dim",
] as const;

type Backend = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

let backend: Backend | null = null;
let activeId: string | null = null;
let writesEnabled = false;
let writePause = 0;

function store(): Backend | null {
  if (backend) return backend;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // storage disabled (some private modes)
  }
}

/** Tests only: swap the storage backend. */
export function setStorageBackend(next: Backend | null): void {
  backend = next;
}

export function getActiveAccountId(): string | null {
  return activeId;
}

/** `base:<id>` for the given (default: active) account, or null with none. */
export function scopedKey(base: string, id: string | null = activeId): string | null {
  return id ? `${base}:${id}` : null;
}

export function readKey(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeKey(key: string, value: string): boolean {
  try {
    store()?.setItem(key, value);
    return true;
  } catch {
    return false; // quota or disabled storage; the in-memory state still works
  }
}

export function removeKey(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/** Every key currently in storage. */
export function allKeys(): string[] {
  const s = store();
  if (!s) return [];
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k) out.push(k);
  }
  return out;
}

/**
 * Makes `id` the account whose keys are readable. Writes stay off until
 * `enableWrites()`, so the store can be reset in memory first without that
 * reset landing on disk.
 */
export function setActiveAccount(id: string | null): void {
  activeId = id;
  writesEnabled = false;
}

export function enableWrites(): void {
  if (activeId) writesEnabled = true;
}

/** Runs `fn` with writes suppressed — used when re-reading what another tab wrote. */
export function withoutWrites<T>(fn: () => T): T {
  writePause++;
  try {
    return fn();
  } finally {
    writePause--;
  }
}

/** The zustand storage: transparently scoped to the active account. */
export const accountStorage: StateStorage = {
  getItem: (name) => {
    const key = scopedKey(name);
    return key ? readKey(key) : null;
  },
  setItem: (name, value) => {
    if (!writesEnabled || writePause > 0) return;
    const key = scopedKey(name);
    if (key) writeKey(key, value);
  },
  removeItem: (name) => {
    const key = scopedKey(name);
    if (key) removeKey(key);
  },
};

/** Whether this browser already holds a store for `id`. */
export function hasAccountStore(id: string): boolean {
  return readKey(`${STORE_KEY}:${id}`) != null;
}

/** Removes everything this browser keeps for `id` in local storage. */
export function eraseAccountKeys(id: string): void {
  removeKey(`${STORE_KEY}:${id}`);
  for (const prefix of ACCOUNT_KEY_PREFIXES) removeKey(`${prefix}:${id}`);
}

/* ── appearance before first paint ──────────────────────────────
   The inline script in `app/layout.tsx` paints the right look before React
   loads. It reads these per-account keys, picking the account from the
   stored session, so a signed-out screen never shows the last person's look. */

export type AppearanceKey = "surface" | "palette" | "wallpaper" | "wallpaper-dim";

export function writeAppearance(key: AppearanceKey, value: string): void {
  const k = scopedKey(`upsc-chronicle-${key}`);
  if (k) writeKey(k, value);
}
