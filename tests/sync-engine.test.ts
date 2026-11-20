import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SyncEngine,
  SyncError,
  type BaseStore,
  type LocalStoreAdapter,
  type RemoteHead,
  type Snapshot,
  type SyncBase,
  type SyncTransport,
} from "@/lib/sync/engine";
import type { MergeConflict } from "@/lib/sync/merge";

/* ── a fake cloud with the same compare-and-swap rules as save_chronicle_state ── */

class FakeCloud {
  row: { data: Snapshot; version: number; updatedAt: string } | null = null;
  online = true;
  fetches = 0;
  /** Version checks, the cheap "has anything changed?" call. */
  heads = 0;
  private clock = Date.parse("2026-11-15T10:00:00Z");

  private head(): RemoteHead {
    return this.row
      ? { version: this.row.version, updatedAt: this.row.updatedAt }
      : { version: 0, updatedAt: null };
  }
  private check() {
    if (!this.online) throw new SyncError("offline", "network");
  }
  transport(): SyncTransport {
    return {
      head: async () => {
        this.check();
        this.heads++;
        return this.row ? this.head() : null;
      },
      fetch: async () => {
        this.check();
        this.fetches++;
        return this.row ? { data: structuredClone(this.row.data), ...this.head() } : null;
      },
      save: async (data, base) => {
        this.check();
        const stamp = new Date((this.clock += 1000)).toISOString();
        if (base <= 0) {
          if (this.row) return { saved: false, head: this.head() };
          this.row = { data: structuredClone(data), version: 1, updatedAt: stamp };
          return { saved: true, head: this.head() };
        }
        if (!this.row || this.row.version !== base) return { saved: false, head: this.head() };
        this.row = { data: structuredClone(data), version: base + 1, updatedAt: stamp };
        return { saved: true, head: this.head() };
      },
    };
  }
}

/* ── a fake device: a store plus the place it keeps its last-synced copy ── */

class Device {
  state: Snapshot;
  base: SyncBase | null = null;
  conflicts: MergeConflict[] = [];
  private listeners = new Set<() => void>();
  engine: SyncEngine;

  constructor(cloud: FakeCloud, initial: Snapshot, opts: { pristine: boolean; legacy?: { syncedAt: string | null } }) {
    this.state = structuredClone(initial);
    const store: LocalStoreAdapter = {
      read: () => this.state,
      apply: (next) => {
        this.state = structuredClone(next);
        this.listeners.forEach((l) => l());
      },
      subscribe: (fn) => {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
      },
    };
    const baseStore: BaseStore = {
      load: async () => this.base,
      save: async (b) => {
        this.base = structuredClone(b);
      },
    };
    this.engine = new SyncEngine({
      transport: cloud.transport(),
      store,
      baseStore,
      pristine: opts.pristine,
      legacy: opts.legacy,
      debounceMs: 60_000, // tests drive syncs explicitly
      onConflicts: (c) => this.conflicts.push(...c),
    });
  }

  edit(fn: (s: Snapshot) => void) {
    const next = structuredClone(this.state);
    fn(next);
    this.state = next;
    this.listeners.forEach((l) => l());
  }
}

type Day = { date: string; totalHours: number };
const days = (s: Snapshot) => ((s.journal as Day[]) ?? []).map((d) => d.date).sort();
const template = (): Snapshot => ({ profile: { name: "Asha", dailyHourTarget: 8 }, journal: [], habits: [] });

test("a new account's first device creates the cloud copy; a second device adopts it", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template(), { pristine: true });
  await laptop.engine.start();
  assert.equal(cloud.row?.version, 1);

  const phone = new Device(cloud, { profile: { name: "", dailyHourTarget: 8 }, journal: [], habits: [] }, { pristine: true });
  await phone.engine.start();
  assert.deepEqual(phone.state, cloud.row?.data, "the pristine phone takes the cloud copy");
  assert.equal(cloud.row?.version, 1, "and writes nothing back");
  laptop.engine.stop();
  phone.engine.stop();
});

test("edits made on two devices while apart are all kept (no lost updates)", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template(), { pristine: true });
  await laptop.engine.start();
  const phone = new Device(cloud, template(), { pristine: true });
  await phone.engine.start();

  // Both offline, both logging.
  cloud.online = false;
  laptop.edit((s) => (s.journal as Day[]).push({ date: "2026-11-10", totalHours: 6 }));
  phone.edit((s) => (s.journal as Day[]).push({ date: "2026-11-11", totalHours: 7 }));
  phone.edit((s) => ((s.profile as { name: string }).name = "Asha R."));
  assert.equal(await laptop.engine.sync(), false);
  assert.equal(laptop.engine.getState().status, "offline");
  assert.equal(laptop.engine.getState().pending, true);

  cloud.online = true;
  assert.ok(await laptop.engine.sync());
  assert.ok(await phone.engine.sync()); // refused once, merges, saves
  assert.ok(await laptop.engine.sync()); // picks up the phone's merge

  assert.deepEqual(days(cloud.row!.data), ["2026-11-10", "2026-11-11"]);
  assert.equal((cloud.row!.data.profile as { name: string }).name, "Asha R.");
  assert.deepEqual(laptop.state, phone.state, "both devices end up identical");
  assert.equal(phone.conflicts.length, 0);
  laptop.engine.stop();
  phone.engine.stop();
});

test("a device with no local edits never overwrites newer cloud data", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template(), { pristine: true });
  await laptop.engine.start();
  const stale = new Device(cloud, template(), { pristine: true });
  await stale.engine.start();

  laptop.edit((s) => (s.journal as Day[]).push({ date: "2026-11-12", totalHours: 5 }));
  await laptop.engine.sync();
  const before = structuredClone(cloud.row);

  await stale.engine.sync(); // was behind; should only fast-forward
  assert.deepEqual(cloud.row, before, "the stale device wrote nothing");
  assert.deepEqual(days(stale.state), ["2026-11-12"]);
  laptop.engine.stop();
  stale.engine.stop();
});

test("the same field changed on both devices: this device wins, the other value is recorded", async () => {
  const cloud = new FakeCloud();
  const a = new Device(cloud, template(), { pristine: true });
  await a.engine.start();
  const b = new Device(cloud, template(), { pristine: true });
  await b.engine.start();

  a.edit((s) => ((s.profile as { dailyHourTarget: number }).dailyHourTarget = 9));
  b.edit((s) => ((s.profile as { dailyHourTarget: number }).dailyHourTarget = 10));
  await a.engine.sync();
  await b.engine.sync();

  assert.equal((cloud.row!.data.profile as { dailyHourTarget: number }).dailyHourTarget, 10);
  assert.deepEqual(b.conflicts, [{ path: "profile.dailyHourTarget", kept: 10, discarded: 9 }]);
  a.engine.stop();
  b.engine.stop();
});

test("pre-account data: local wins when the cloud hasn't changed since this browser last synced", async () => {
  const cloud = new FakeCloud();
  cloud.row = { data: { ...template(), journal: [{ date: "2026-11-01", totalHours: 4 }] }, version: 1, updatedAt: "2026-11-14T08:00:00.000Z" };
  const local = { ...template(), journal: [{ date: "2026-11-01", totalHours: 4 }, { date: "2026-11-14", totalHours: 9 }] };
  const owner = new Device(cloud, local, { pristine: false, legacy: { syncedAt: "2026-11-14T08:00:00.000Z" } });
  await owner.engine.start();
  assert.deepEqual(days(cloud.row!.data), ["2026-11-01", "2026-11-14"], "the unsynced day reached the cloud");
  owner.engine.stop();
});

test("pre-account data: when the cloud moved on, both sides' days are kept", async () => {
  const cloud = new FakeCloud();
  cloud.row = {
    data: { ...template(), journal: [{ date: "2026-11-01", totalHours: 4 }, { date: "2026-11-13", totalHours: 6 }] },
    version: 3,
    updatedAt: "2026-11-14T09:00:00.000Z",
  };
  const local = { ...template(), journal: [{ date: "2026-11-01", totalHours: 4 }, { date: "2026-11-12", totalHours: 8 }] };
  const owner = new Device(cloud, local, { pristine: false, legacy: { syncedAt: "2026-11-10T08:00:00.000Z" } });
  await owner.engine.start();
  assert.deepEqual(days(cloud.row!.data), ["2026-11-01", "2026-11-12", "2026-11-13"]);
  owner.engine.stop();
});

test("a stopped engine never applies a late response to the store", async () => {
  const cloud = new FakeCloud();
  cloud.row = { data: { ...template(), journal: [{ date: "2026-11-05", totalHours: 3 }] }, version: 2, updatedAt: null as unknown as string };
  let release: () => void = () => {};
  const slow = cloud.transport();
  const gated: SyncTransport = {
    ...slow,
    fetch: () => new Promise((resolve) => (release = () => resolve(slow.fetch()))),
  };
  const device = new Device(cloud, template(), { pristine: true });
  // Swap in the gated transport for this device's engine.
  (device.engine as unknown as { o: { transport: SyncTransport } }).o.transport = gated;
  const started = device.engine.start();
  await new Promise((r) => setTimeout(r, 10));
  device.engine.stop(); // e.g. the account was switched
  release();
  await started;
  assert.deepEqual(device.state, template(), "nothing from the old session landed");
});

test("a live update about another device's save pulls it; one about this device's own save asks nothing", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template(), { pristine: true });
  await laptop.engine.start();
  const phone = new Device(cloud, template(), { pristine: true });
  await phone.engine.start();

  // The phone saves; the message the laptop gets carries the new version.
  phone.edit((s) => {
    (s.journal as Day[]).push({ date: "2026-11-16", totalHours: 6 });
  });
  await phone.engine.sync();
  const version = cloud.row!.version;
  await laptop.engine.checkRemote({ version });
  assert.deepEqual(days(laptop.state), ["2026-11-16"], "the laptop has the phone's day");

  // The phone gets the message about its own save: not even a version check.
  const asked = { heads: cloud.heads, fetches: cloud.fetches };
  await phone.engine.checkRemote({ version });
  assert.deepEqual({ heads: cloud.heads, fetches: cloud.fetches }, asked, "nothing asked for its own save");
  // Without a version (a reconnect, a return to the app) it checks, as before.
  await phone.engine.checkRemote();
  assert.equal(cloud.heads, asked.heads + 1, "a plain check asks for the version");
  laptop.engine.stop();
  phone.engine.stop();
});

test("a live update that arrives during a sync is checked once the sync is done", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template(), { pristine: true });
  await laptop.engine.start();
  const phone = new Device(cloud, template(), { pristine: true });
  await phone.engine.start();

  laptop.edit((s) => {
    (s.habits as unknown[]).push({ id: "h1", name: "Newspaper" });
  });
  const running = laptop.engine.sync();
  // While the laptop is saving, the phone saves too, and the message about it reaches the laptop.
  phone.edit((s) => {
    (s.journal as Day[]).push({ date: "2026-11-17", totalHours: 4 });
  });
  await phone.engine.sync();
  void laptop.engine.checkRemote({ version: cloud.row!.version });
  await running;
  // The check deferred until the sync finished runs now; give it a moment.
  for (let i = 0; i < 20 && !days(laptop.state).includes("2026-11-17"); i++) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(days(laptop.state), ["2026-11-17"], "the phone's day arrived after the laptop's own save");
  assert.ok(JSON.stringify(cloud.row!.data).includes("Newspaper"), "and the laptop's habit is in the cloud");
  laptop.engine.stop();
  phone.engine.stop();
});
