import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import {
  accountStorage,
  eraseAccountKeys,
  setActiveAccount,
  enableWrites,
  setStorageBackend,
  withoutWrites,
} from "@/lib/account/scope";
import { claimLegacyData, settleLegacyClaim } from "@/lib/account/legacy";
import { activateAccount, deactivateAccount } from "@/lib/account/session";
import { useChronicle } from "@/lib/store";
import { defaultSetup } from "@/lib/seed";

let disk: MemoryStorage;
beforeEach(() => {
  disk = new MemoryStorage();
  setStorageBackend(disk as unknown as Storage);
  setActiveAccount(null);
});

test("with no active account, nothing can be read or written", () => {
  accountStorage.setItem("upsc-chronicle-store", "{}");
  assert.equal(disk.length, 0);
  assert.equal(accountStorage.getItem("upsc-chronicle-store"), null);
});

test("each account reads and writes only its own key", () => {
  setActiveAccount("alice");
  enableWrites();
  accountStorage.setItem("upsc-chronicle-store", "alice-data");
  setActiveAccount("bob");
  assert.equal(accountStorage.getItem("upsc-chronicle-store"), null, "bob can't see alice's data");
  enableWrites();
  accountStorage.setItem("upsc-chronicle-store", "bob-data");
  assert.equal(disk.getItem("upsc-chronicle-store:alice"), "alice-data");
  assert.equal(disk.getItem("upsc-chronicle-store:bob"), "bob-data");
});

test("switching accounts turns writes off until the new account is ready", () => {
  setActiveAccount("alice");
  enableWrites();
  setActiveAccount("bob"); // writes off again
  accountStorage.setItem("upsc-chronicle-store", "would-be-a-leak");
  assert.equal(disk.getItem("upsc-chronicle-store:bob"), null);
  enableWrites();
  withoutWrites(() => accountStorage.setItem("upsc-chronicle-store", "echo"));
  assert.equal(disk.getItem("upsc-chronicle-store:bob"), null, "re-reads from another tab never write back");
});

test("erasing an account removes its keys and nobody else's", () => {
  disk.setItem("upsc-chronicle-store:alice", "a");
  disk.setItem("upsc-chronicle-surface:alice", "black");
  disk.setItem("upsc-chronicle-store:bob", "b");
  eraseAccountKeys("alice");
  assert.deepEqual(disk.keys(), ["upsc-chronicle-store:bob"]);
});

const LEGACY = JSON.stringify({ state: { profile: { name: "Owner" }, journal: [{ date: "2026-11-01" }] }, version: 9 });

test("pre-account data goes only to the account that last synced it from this browser", () => {
  disk.setItem("upsc-chronicle-store", LEGACY);
  disk.setItem("upsc-chronicle-cloud-synced:owner", "2026-11-14T08:00:00.000Z");
  disk.setItem("upsc-chronicle-cloud-synced:friend", "2026-10-01T08:00:00.000Z");

  assert.equal(claimLegacyData("newcomer", "cloud"), null, "a new account gets nothing");
  assert.equal(claimLegacyData("friend", "cloud"), null, "nor an older one");
  assert.equal(disk.getItem("upsc-chronicle-store:newcomer"), null);

  const claim = claimLegacyData("owner", "cloud");
  assert.deepEqual(claim, { syncedAt: "2026-11-14T08:00:00.000Z" });
  assert.equal(disk.getItem("upsc-chronicle-store:owner"), LEGACY);
  assert.equal(disk.getItem("upsc-chronicle-store"), LEGACY, "the original stays until a sync confirms the move");

  assert.deepEqual(claimLegacyData("owner", "cloud"), claim, "a retry resumes the same claim");
  settleLegacyClaim("owner");
  assert.equal(disk.getItem("upsc-chronicle-store"), null);
  assert.equal(disk.getItem("upsc-chronicle-cloud-synced:friend"), null);
  assert.equal(claimLegacyData("friend", "cloud"), null);
});

test("data from before accounts with no sync marker is never handed out", () => {
  disk.setItem("upsc-chronicle-store", LEGACY);
  assert.equal(claimLegacyData("anyone", "cloud"), null);
  assert.equal(disk.getItem("upsc-chronicle-store"), LEGACY, "left untouched for manual recovery");
});

type Entry = { date: string; totalHours: number };
const entry = (date: string, hours: number) => ({ ...useChronicle.getState().journal[0], id: date, date, totalHours: hours, blocks: [], mood: 3, energy: 3, motivation: 3, focus: 3 });

test("two accounts on one browser never see each other's data, in memory or on disk", async () => {
  await activateAccount("alice", "cloud");
  useChronicle.getState().completeOnboarding({ ...defaultSetup(), name: "Alice" });
  useChronicle.getState().upsertJournal(entry("2026-11-10", 6));
  deactivateAccount();

  // Signed out: the in-memory store is blank.
  assert.equal(useChronicle.getState().journal.length, 0);
  assert.equal(useChronicle.getState().profile.name, "");

  await activateAccount("bob", "cloud");
  assert.equal(useChronicle.getState().journal.length, 0, "bob starts clean");
  assert.equal(useChronicle.getState().profile.onboardedAt, undefined, "and is sent to setup");
  useChronicle.getState().completeOnboarding({ ...defaultSetup(), name: "Bob" });
  useChronicle.getState().upsertJournal(entry("2026-11-11", 3));
  deactivateAccount();

  await activateAccount("alice", "cloud");
  const alice = useChronicle.getState();
  assert.equal(alice.profile.name, "Alice");
  assert.deepEqual(alice.journal.map((e: Entry) => e.date), ["2026-11-10"], "alice sees only her own day");

  const onDisk = disk.getItem("upsc-chronicle-store:bob") ?? "";
  assert.ok(onDisk.includes("2026-11-11") && !onDisk.includes("2026-11-10"), "bob's saved copy holds only bob's day");
  deactivateAccount();
});
