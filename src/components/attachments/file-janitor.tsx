"use client";

import { useEffect, useState } from "react";
import { useChronicle } from "@/lib/store";
import { useAccount, useSyncStatus } from "@/components/account/account-session";
import { listStoredObjects, removeStoredPaths } from "@/lib/file-storage";
import { readKey, writeKey } from "@/lib/account/scope";
import { toISODate } from "@/lib/utils";

/** Objects younger than this are left alone by the sweep: another device may not have synced their record yet. */
const SWEEP_MIN_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Keeps Storage in step with the journal, without the user doing anything.
 *
 *  - Deletes files this device removed (the store queues their paths), and
 *    retries whenever the device comes back online.
 *  - Once a day, after a successful sync, deletes stored objects that no file
 *    record mentions any more — uploads from a composer that was closed
 *    without saving, say. Only objects at least two days old are touched, and
 *    never while the account has no records at all, so a slow first sync can't
 *    be mistaken for "nothing is attached".
 *
 * Renders nothing.
 */
export function FileJanitor() {
  const { mode, accountId } = useAccount();
  const { sync } = useSyncStatus();
  const trash = useChronicle((s) => s.fileTrash);
  const files = useChronicle((s) => s.files);
  const clearFileTrash = useChronicle((s) => s.clearFileTrash);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine !== false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (mode !== "cloud" || !online || !trash.length) return;
    let alive = true;
    const batch = [...trash];
    void removeStoredPaths(batch).then((ok) => {
      if (ok && alive) clearFileTrash(batch);
    });
    return () => {
      alive = false;
    };
  }, [mode, online, trash, clearFileTrash]);

  const synced = sync.status === "synced" && !sync.pending && Boolean(sync.lastSyncedAt);
  useEffect(() => {
    if (mode !== "cloud" || !online || !synced || !files.length) return;
    const key = `upsc-chronicle-file-sweep:${accountId}`;
    const today = toISODate(new Date());
    if (readKey(key) === today) return;
    let alive = true;
    void (async () => {
      const known = new Set(files.map((f) => f.path));
      const objects = await listStoredObjects(accountId);
      if (!alive) return;
      const now = Date.now();
      const stray = objects
        .filter((o) => !known.has(o.path))
        .filter((o) => o.createdAt && now - Date.parse(o.createdAt) > SWEEP_MIN_AGE_MS)
        .map((o) => o.path);
      if (stray.length) await removeStoredPaths(stray);
      writeKey(key, today);
    })();
    return () => {
      alive = false;
    };
    // `files` is read inside; the sweep runs once a day, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, online, synced, accountId]);

  return null;
}
