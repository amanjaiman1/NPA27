"use client";

/**
 * Where each account's last-synced copy lives on this device: IndexedDB, so a
 * second full copy of the data doesn't eat into the ~5 MB localStorage holds.
 * Falls back to localStorage, then to memory, when IndexedDB is unavailable
 * (some private-browsing modes); a lost copy only costs one extra download.
 */

import type { BaseStore, SyncBase } from "./engine";
import { readKey, removeKey, writeKey } from "../account/scope";

const DB_NAME = "upsc-chronicle-sync";
const STORE = "bases";
const FALLBACK_PREFIX = "upsc-chronicle-sync-base:";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no indexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function isBase(v: unknown): v is SyncBase {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as SyncBase).version === "number" &&
    typeof (v as SyncBase).data === "object"
  );
}

export function createBaseStore(accountId: string): BaseStore {
  let memory: SyncBase | null = null;
  return {
    async load() {
      try {
        const v = await run("readonly", (s) => s.get(accountId) as IDBRequest<unknown>);
        if (isBase(v)) return v;
      } catch {
        /* fall through */
      }
      try {
        const raw = readKey(FALLBACK_PREFIX + accountId);
        const v: unknown = raw ? JSON.parse(raw) : null;
        if (isBase(v)) return v;
      } catch {
        /* fall through */
      }
      return memory;
    },
    async save(base) {
      memory = base;
      try {
        await run("readwrite", (s) => s.put(base, accountId));
        removeKey(FALLBACK_PREFIX + accountId);
        return;
      } catch {
        /* fall through */
      }
      writeKey(FALLBACK_PREFIX + accountId, JSON.stringify(base));
    },
  };
}

/** Forgets the account's synced copy on this device (sign-out, deletion). */
export async function clearBaseStore(accountId: string): Promise<void> {
  removeKey(FALLBACK_PREFIX + accountId);
  try {
    await run("readwrite", (s) => s.delete(accountId));
  } catch {
    /* nothing stored */
  }
}
