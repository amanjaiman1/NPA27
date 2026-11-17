"use client";

import { useChronicle, readCloudSnapshot, SNAPSHOT_KEYS, type CloudSnapshot } from "../store";
import type { LocalStoreAdapter, Snapshot } from "./engine";

/**
 * The sync engine's view of the zustand store: the synced slice only.
 * Changes to device-only state (delivery bookkeeping, the hydration flag) are
 * ignored, so they never trigger a cloud round trip.
 */
export function chronicleStoreAdapter(): LocalStoreAdapter {
  return {
    read: () => readCloudSnapshot() as unknown as Snapshot,
    apply: (next) =>
      useChronicle.getState().applyCloudSnapshot(next as unknown as Partial<CloudSnapshot>),
    subscribe: (onChange) =>
      useChronicle.subscribe((state, prev) => {
        for (const key of SNAPSHOT_KEYS) {
          if (state[key] !== prev[key]) {
            onChange();
            return;
          }
        }
      }),
  };
}
