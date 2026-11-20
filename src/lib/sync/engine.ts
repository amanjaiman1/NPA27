/* ════════════════════════════════════════════════════════════════
   THE SYNC ENGINE
   Keeps one account's local snapshot and its cloud copy in step, without
   ever letting one device silently overwrite another.

   Every cloud write names the version it was based on. If another device
   saved in between, the write is refused, the newer copy is pulled, the
   two are merged (see `merge.ts`) and the merge is saved instead. Reading
   is cheap: a "head" request returns just the version, and the full
   snapshot is only downloaded when that version has moved.

   No React, no browser globals: the transport, the local store and the
   place the last-synced copy is kept are all passed in, which is what lets
   the tests run two simulated devices against one fake server.
   ════════════════════════════════════════════════════════════════ */

import { deepEqual, merge3, mergeTwoWay, type MergeConflict } from "./merge";

export type Snapshot = Record<string, unknown>;

export interface RemoteHead {
  version: number;
  updatedAt: string | null;
}

export interface RemoteDoc extends RemoteHead {
  data: Snapshot;
}

/** Version 0 in a refusal means the row does not exist. */
export type SaveOutcome = { saved: boolean; head: RemoteHead };

export type SyncErrorKind = "network" | "auth" | "schema" | "rejected" | "server" | "stopped";

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: SyncErrorKind,
  ) {
    super(message);
    this.name = "SyncError";
  }
}

export interface SyncTransport {
  head(): Promise<RemoteHead | null>;
  fetch(): Promise<RemoteDoc | null>;
  save(data: Snapshot, baseVersion: number): Promise<SaveOutcome>;
}

export interface LocalStoreAdapter {
  read(): Snapshot;
  apply(next: Snapshot): void;
  subscribe(onChange: () => void): () => void;
}

/** The copy both sides last agreed on — what a three-way merge measures edits against. */
export interface SyncBase {
  version: number;
  data: Snapshot;
}

export interface BaseStore {
  load(): Promise<SyncBase | null>;
  save(base: SyncBase): Promise<void>;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

export interface SyncState {
  status: SyncStatus;
  /** Local changes that have not reached the cloud yet. */
  pending: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  errorKind: SyncErrorKind | null;
}

export interface SyncEngineOptions {
  transport: SyncTransport;
  store: LocalStoreAdapter;
  baseStore: BaseStore;
  /**
   * True when this device held no data for the account before this session,
   * so there is nothing local worth keeping if the cloud already has a copy.
   */
  pristine: boolean;
  /**
   * Set once, for data saved on this device before versioned sync existed:
   * the time it last synced under the old scheme. Lets the first sync decide
   * whether the local copy is the newer one.
   */
  legacy?: { syncedAt: string | null } | null;
  debounceMs?: number;
  maxWaitMs?: number;
  onState?: (state: SyncState) => void;
  onConflicts?: (conflicts: MergeConflict[]) => void;
  /** Called after the first successful sync when `legacy` was set. */
  onLegacySettled?: () => void;
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
}

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
const SLOW_RETRY_MS = 5 * 60_000;
const MAX_CONFLICT_ROUNDS = 4;

export class SyncEngine {
  private readonly o: SyncEngineOptions;
  private readonly timers: NonNullable<SyncEngineOptions["timers"]>;
  private base: SyncBase | null = null;
  private stopped = false;
  private applying = false;
  private unsubscribe: (() => void) | null = null;
  private running: Promise<void> | null = null;
  private rerun = false;
  /** A check for other devices' changes asked for while a sync was running. */
  private recheck = false;
  private lastOk = false;
  private debounceTimer: unknown = null;
  private firstPendingAt: number | null = null;
  private retryTimer: unknown = null;
  private retryIndex = 0;
  private legacy: SyncEngineOptions["legacy"];
  private state: SyncState = {
    status: "idle",
    pending: false,
    lastSyncedAt: null,
    error: null,
    errorKind: null,
  };

  constructor(options: SyncEngineOptions) {
    this.o = options;
    this.legacy = options.legacy ?? null;
    this.timers = options.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
  }

  getState(): SyncState {
    return this.state;
  }

  /** Loads the last agreed copy and runs the first sync. Never throws. */
  async start(): Promise<boolean> {
    try {
      this.base = await this.o.baseStore.load();
    } catch {
      this.base = null;
    }
    this.unsubscribe = this.o.store.subscribe(() => {
      if (this.applying || this.stopped) return;
      this.setState({ pending: true, status: this.state.status === "error" ? "error" : "syncing" });
      this.schedulePush();
    });
    return this.sync();
  }

  /** Stops for good. Anything still in flight is discarded, never applied. */
  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clearTimer("debounceTimer");
    this.clearTimer("retryTimer");
  }

  /** Runs a full sync now. Concurrent calls coalesce into one extra pass. */
  sync(): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    if (this.running) {
      this.rerun = true;
      return this.running.then(() => this.lastOk);
    }
    this.clearTimer("debounceTimer");
    this.firstPendingAt = null;
    this.running = (async () => {
      do {
        this.rerun = false;
        await this.cycle();
      } while (this.rerun && !this.stopped);
    })().finally(() => {
      this.running = null;
      if (this.recheck && !this.stopped) {
        this.recheck = false;
        void this.checkRemote();
      }
    });
    return this.running.then(() => this.lastOk);
  }

  /**
   * Cheap check for changes made on another device; pulls only if there are
   * some. `hint.version` is the version a live update says the cloud is at
   * now: when this device already has it (the update was about its own
   * save) there's nothing to ask. A check that arrives during a sync runs
   * once that sync is done, so a change saved meanwhile isn't missed.
   */
  async checkRemote(hint?: { version?: number | null }): Promise<void> {
    if (this.stopped) return;
    const known = hint?.version;
    if (typeof known === "number" && this.base && known <= this.base.version) return;
    if (this.running) {
      this.recheck = true;
      return;
    }
    if (this.state.pending) {
      await this.sync();
      return;
    }
    try {
      const head = await this.o.transport.head();
      this.assertLive();
      if (!head || !this.base || head.version !== this.base.version) await this.sync();
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Whether this device holds anything the cloud doesn't: the local copy
   * differs from the one both last agreed on, or there has been no agreement
   * yet this session (a first sync still on its way counts as unsynced).
   */
  hasUnsyncedChanges(): boolean {
    return this.base ? !deepEqual(this.o.store.read(), this.base.data) : true;
  }

  /** Pushes anything pending and waits, up to `timeoutMs`. True when fully in sync. */
  async flush(timeoutMs = 8_000): Promise<boolean> {
    if (this.stopped) return false;
    if (!this.state.pending && this.state.status === "synced" && !this.running) return true;
    let timer: unknown = null;
    const timeout = new Promise<boolean>((resolve) => {
      timer = this.timers.setTimeout(() => resolve(false), timeoutMs);
    });
    const ok = await Promise.race([this.sync(), timeout]);
    this.timers.clearTimeout(timer);
    return ok && !this.state.pending;
  }

  /* ── internals ─────────────────────────────────────────────── */

  private async cycle(): Promise<void> {
    if (this.stopped) return;
    this.setState({ status: "syncing" });
    try {
      if (!this.base) {
        // Nothing agreed on this device yet (a fresh browser, or a first sync
        // still to finish): asking for the version first could never save the
        // download, it would only add a round trip before it.
        const doc = await this.o.transport.fetch();
        this.assertLive();
        if (!doc) await this.pushLoop(this.o.store.read(), 0);
        else await this.integrate(doc, true);
        this.settled();
        return;
      }
      const head = await this.o.transport.head();
      this.assertLive();
      const local = this.o.store.read();

      if (!head) {
        await this.pushLoop(local, 0);
      } else if (this.base && head.version === this.base.version) {
        if (deepEqual(local, this.base.data)) this.markSynced(head);
        else await this.pushLoop(local, this.base.version);
      } else {
        const doc = await this.o.transport.fetch();
        this.assertLive();
        if (!doc) await this.pushLoop(this.o.store.read(), 0);
        else await this.integrate(doc, true);
      }
      this.settled();
    } catch (e) {
      this.lastOk = false;
      this.fail(e);
    }
  }

  /** A cycle that reached the cloud and agreed with it. */
  private settled(): void {
    this.lastOk = true;
    this.retryIndex = 0;
    if (this.legacy) {
      this.legacy = null;
      this.o.onLegacySettled?.();
    }
  }

  /**
   * Folds a newer cloud copy into the local one and saves the result if it
   * differs from the cloud. `firstContact` marks the reconcile that opens a
   * session, which is the only time the no-base rules apply.
   */
  private async integrate(doc: RemoteDoc, firstContact: boolean): Promise<void> {
    const local = this.o.store.read();
    let merged: Snapshot;
    let conflicts: MergeConflict[] = [];

    if (this.base) {
      if (deepEqual(local, this.base.data)) merged = doc.data;
      else ({ value: merged, conflicts } = merge3(this.base.data, local, doc.data));
    } else if (firstContact && this.o.pristine && !this.legacy) {
      merged = doc.data;
    } else if (firstContact && this.legacy && this.cloudUnchangedSinceLegacySync(doc)) {
      merged = local;
    } else {
      // No common ancestor: keep everything from both, the cloud's wins on a clash
      // unless this device is known to hold the newer copy.
      ({ value: merged, conflicts } = mergeTwoWay(local, doc.data, "remote"));
    }

    await this.setBase({ version: doc.version, data: doc.data });
    this.applyLocal(merged, local);
    if (conflicts.length) this.o.onConflicts?.(conflicts);

    const now = this.o.store.read();
    if (deepEqual(now, doc.data)) this.markSynced(doc);
    else await this.pushLoop(now, doc.version);
  }

  private cloudUnchangedSinceLegacySync(doc: RemoteDoc): boolean {
    const at = this.legacy?.syncedAt ? Date.parse(this.legacy.syncedAt) : NaN;
    const remoteAt = doc.updatedAt ? Date.parse(doc.updatedAt) : NaN;
    return Number.isFinite(at) && Number.isFinite(remoteAt) && remoteAt <= at;
  }

  private async pushLoop(data: Snapshot, baseVersion: number): Promise<void> {
    let payload = data;
    let version = baseVersion;
    for (let round = 0; round < MAX_CONFLICT_ROUNDS; round++) {
      this.assertLive();
      const outcome = await this.o.transport.save(payload, version);
      this.assertLive();
      if (outcome.saved) {
        await this.setBase({ version: outcome.head.version, data: payload });
        this.markSynced(outcome.head);
        return;
      }
      // Someone else saved first. Pull their copy and merge before trying again.
      const doc = await this.o.transport.fetch();
      this.assertLive();
      if (!doc) {
        version = 0;
        payload = this.o.store.read();
        continue;
      }
      await this.integrateAfterRefusal(doc);
      payload = this.o.store.read();
      version = doc.version;
      if (deepEqual(payload, doc.data)) {
        this.markSynced(doc);
        return;
      }
    }
    throw new SyncError("Another device kept saving at the same moment. Will retry.", "server");
  }

  private async integrateAfterRefusal(doc: RemoteDoc): Promise<void> {
    const local = this.o.store.read();
    let merged: Snapshot;
    let conflicts: MergeConflict[] = [];
    if (this.base) ({ value: merged, conflicts } = merge3(this.base.data, local, doc.data));
    else if (this.o.pristine && !this.legacy) merged = doc.data;
    else ({ value: merged, conflicts } = mergeTwoWay(local, doc.data, this.legacy ? "local" : "remote"));
    await this.setBase({ version: doc.version, data: doc.data });
    this.applyLocal(merged, local);
    if (conflicts.length) this.o.onConflicts?.(conflicts);
  }

  private applyLocal(next: Snapshot, current: Snapshot): void {
    if (deepEqual(next, current)) return;
    this.assertLive();
    this.applying = true;
    try {
      this.o.store.apply(next);
    } finally {
      this.applying = false;
    }
  }

  private async setBase(base: SyncBase): Promise<void> {
    this.base = base;
    try {
      await this.o.baseStore.save(base);
    } catch {
      /* the in-memory copy still serves this session */
    }
  }

  private markSynced(head: RemoteHead): void {
    const pending = this.base ? !deepEqual(this.o.store.read(), this.base.data) : true;
    this.setState({
      status: "synced",
      pending,
      lastSyncedAt: head.updatedAt ?? new Date().toISOString(),
      error: null,
      errorKind: null,
    });
    if (pending) this.schedulePush();
  }

  private fail(e: unknown): void {
    if (this.stopped) return;
    const err =
      e instanceof SyncError ? e : new SyncError(e instanceof Error ? e.message : String(e), "network");
    if (err.kind === "stopped") return;
    const offline = err.kind === "network" || err.kind === "auth";
    this.setState({
      status: offline ? "offline" : "error",
      error: err.message,
      errorKind: err.kind,
      pending: this.base ? !deepEqual(this.o.store.read(), this.base.data) : true,
    });
    const slow = err.kind === "schema" || err.kind === "rejected";
    const delay = slow
      ? SLOW_RETRY_MS
      : RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)];
    this.retryIndex++;
    this.clearTimer("retryTimer");
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, delay);
  }

  private schedulePush(): void {
    if (this.stopped) return;
    const debounce = this.o.debounceMs ?? 2_000;
    const maxWait = this.o.maxWaitMs ?? 10_000;
    const now = Date.now();
    if (this.firstPendingAt == null) this.firstPendingAt = now;
    const wait = Math.max(0, Math.min(debounce, this.firstPendingAt + maxWait - now));
    this.clearTimer("debounceTimer");
    this.debounceTimer = this.timers.setTimeout(() => {
      this.debounceTimer = null;
      void this.sync();
    }, wait);
  }

  private clearTimer(which: "debounceTimer" | "retryTimer"): void {
    if (this[which] != null) this.timers.clearTimeout(this[which]);
    this[which] = null;
  }

  private assertLive(): void {
    if (this.stopped) throw new SyncError("Sync stopped.", "stopped");
  }

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    if (!this.stopped) this.o.onState?.(this.state);
  }
}
