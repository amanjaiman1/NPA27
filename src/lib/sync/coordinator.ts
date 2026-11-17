"use client";

/**
 * One syncing tab per account per browser.
 *
 * With two tabs open, both would otherwise push the same edits and the second
 * would always collide with the first — a wasted full download per edit. The
 * Web Locks API elects a leader: it alone talks to the cloud. Other tabs keep
 * saving locally (the leader picks those saves up through `storage` events)
 * and hear its sync status over a BroadcastChannel. When the leader tab
 * closes, a waiting tab takes over. Browsers without Web Locks simply let
 * every tab sync, which is still correct, only chattier.
 */

import type { SyncEngine, SyncState } from "./engine";

export type SyncRole = "leader" | "follower";

type Message =
  | { type: "state"; state: SyncState }
  | { type: "hello" }
  | { type: "flush"; id: string }
  | { type: "flushed"; id: string; ok: boolean }
  | { type: "check" }
  | { type: "sync" };

export interface Coordinator {
  role(): SyncRole;
  flush(timeoutMs?: number): Promise<boolean>;
  checkRemote(): void;
  syncNow(): void;
  stop(): void;
}

export interface CoordinatorOptions {
  accountId: string;
  createEngine: (onState: (state: SyncState) => void) => SyncEngine;
  onState: (state: SyncState) => void;
  onRole?: (role: SyncRole) => void;
}

export function startCoordinator(o: CoordinatorOptions): Coordinator {
  const name = `upsc-chronicle-sync:${o.accountId}`;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(name) : null;
  const abort = typeof AbortController !== "undefined" ? new AbortController() : null;
  const waiters = new Map<string, (ok: boolean) => void>();
  let role: SyncRole = "follower";
  let engine: SyncEngine | null = null;
  let release: (() => void) | null = null;
  let stopped = false;

  const post = (m: Message) => {
    try {
      channel?.postMessage(m);
    } catch {
      /* channel closed */
    }
  };

  const lead = async () => {
    if (stopped) return;
    role = "leader";
    o.onRole?.("leader");
    engine = o.createEngine((state) => {
      o.onState(state);
      post({ type: "state", state });
    });
    void engine.start();
    // Hold the lock for as long as this tab lives.
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  };

  if (channel) {
    channel.onmessage = (e: MessageEvent<Message>) => {
      const m = e.data;
      if (role === "leader" && engine) {
        if (m.type === "hello") post({ type: "state", state: engine.getState() });
        else if (m.type === "flush")
          void engine.flush().then((ok) => post({ type: "flushed", id: m.id, ok }));
        else if (m.type === "check") void engine.checkRemote();
        else if (m.type === "sync") void engine.sync();
      } else if (role === "follower") {
        if (m.type === "state") o.onState(m.state);
        else if (m.type === "flushed") waiters.get(m.id)?.(m.ok);
      }
    };
  }

  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) {
    void lead();
  } else {
    locks
      .request(name, { ifAvailable: true }, async (lock) => {
        if (lock) return lead();
        // Another tab is syncing this account. Follow it, and queue to take
        // over when that tab goes away.
        o.onRole?.("follower");
        post({ type: "hello" });
        locks
          .request(name, abort ? { signal: abort.signal } : {}, () => lead())
          .catch(() => {
            /* aborted on stop */
          });
      })
      .catch(() => {
        void lead();
      });
  }

  return {
    role: () => role,
    flush(timeoutMs = 8_000) {
      if (role === "leader" && engine) return engine.flush(timeoutMs);
      if (!channel) return Promise.resolve(false);
      const id = Math.random().toString(36).slice(2);
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          waiters.delete(id);
          resolve(false);
        }, timeoutMs);
        waiters.set(id, (ok) => {
          clearTimeout(timer);
          waiters.delete(id);
          resolve(ok);
        });
        post({ type: "flush", id });
      });
    },
    checkRemote() {
      if (role === "leader") void engine?.checkRemote();
      else post({ type: "check" });
    },
    syncNow() {
      if (role === "leader") void engine?.sync();
      else post({ type: "sync" });
    },
    stop() {
      stopped = true;
      engine?.stop();
      engine = null;
      release?.();
      abort?.abort();
      waiters.forEach((resolve) => resolve(false));
      waiters.clear();
      channel?.close();
    },
  };
}
