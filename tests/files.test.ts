import { test } from "node:test";
import assert from "node:assert/strict";
import type { FileRecord, Goal, JournalEntry, LifeEntry } from "@/lib/types";
import {
  MAX_FILE_BYTES,
  buildFileRefs,
  checkFile,
  cleanFileName,
  describeLinks,
  dropForeignFiles,
  filesByIds,
  pruneFiles,
  resolveFileType,
  storagePath,
} from "@/lib/files";

const file = (id: string, user = "u1", over: Partial<FileRecord> = {}): FileRecord => ({
  id,
  sha256: `sha-${id}`,
  path: storagePath(user, `sha-${id}`),
  name: `${id}.pdf`,
  type: "application/pdf",
  size: 1000,
  addedAt: "2026-11-10T08:00:00.000Z",
  ...over,
});

const day = (date: string, fileIds?: string[]): JournalEntry => ({
  id: `j-${date}`,
  date,
  blocks: [],
  totalHours: 0,
  mood: 3,
  energy: 3,
  motivation: 3,
  focus: 3,
  ...(fileIds ? { fileIds } : {}),
});

const goal = (id: string, fileIds?: string[]): Goal => ({
  id,
  title: `Goal ${id}`,
  horizon: "Weekly",
  status: "Active",
  createdOn: "2026-11-01",
  ...(fileIds ? { fileIds } : {}),
});

test("file types are decided by extension first, and unsupported or oversized files are refused", () => {
  assert.equal(resolveFileType("notes.csv", "application/vnd.ms-excel")?.type, "text/csv", "Windows calls CSVs Excel files");
  assert.equal(resolveFileType("README.md", "")?.kind, "text", "Markdown with no browser type");
  assert.equal(resolveFileType("tool.exe", "application/x-msdownload"), null);

  assert.equal(checkFile({ name: "a.exe", type: "", size: 10 }).ok, false);
  assert.equal(checkFile({ name: "empty.pdf", type: "application/pdf", size: 0 }).ok, false);
  assert.equal(checkFile({ name: "big.pdf", type: "application/pdf", size: MAX_FILE_BYTES + 1 }).ok, false);
  assert.equal(checkFile({ name: "ok.pdf", type: "application/pdf", size: MAX_FILE_BYTES }).ok, true);
  // A large phone photo is accepted: it is downscaled before upload.
  assert.equal(checkFile({ name: "IMG_1.jpg", type: "image/jpeg", size: 9 * 1024 * 1024 }).ok, true);
  assert.equal(checkFile({ name: "anim.gif", type: "image/gif", size: 9 * 1024 * 1024 }).ok, false, "GIFs aren't downscaled");
});

test("file names are cleaned of paths and control characters", () => {
  assert.equal(cleanFileName("C:\\Users\\me\\notes.pdf"), "notes.pdf");
  assert.equal(cleanFileName("a\u0000b\u0007.txt"), "ab.txt");
  assert.equal(cleanFileName("   "), "file");
  assert.ok(cleanFileName(`${"x".repeat(200)}.pdf`).endsWith(".pdf"));
  assert.ok(cleanFileName(`${"x".repeat(200)}.pdf`).length <= 120);
});

test("references list every journal day, goal and life day using a file", () => {
  const refs = buildFileRefs({
    journal: [day("2026-11-12", ["f1"]), day("2026-11-10", ["f1", "f2"])],
    goals: [goal("g1", ["f1"])],
    lifeLog: [{ date: "2026-11-12", fileIds: ["f2"] }],
  });
  assert.deepEqual(refs.get("f1")?.journal, ["2026-11-10", "2026-11-12"], "oldest first");
  assert.deepEqual(refs.get("f1")?.goals, [{ id: "g1", title: "Goal g1" }]);
  assert.deepEqual(refs.get("f2")?.life, ["2026-11-12"]);
  assert.equal(describeLinks(refs.get("f1")!), "the goal “Goal g1”");
  assert.equal(describeLinks({ goals: [], life: ["a", "b"] }), "2 Life Dashboard days");
});

test("a file lives while a journal day holds it; links elsewhere don't keep it alive", () => {
  const files = [file("f1"), file("f2"), file("f3", "u1", { sha256: "sha-f1", path: storagePath("u1", "sha-f1") })];
  const journal = [day("2026-11-10", ["f1"])];
  const goals = [goal("g1", ["f1", "f2"])];
  const lifeLog: LifeEntry[] = [{ id: "l", date: "2026-11-10", fileIds: ["f2"] }];
  const out = pruneFiles({ files, journal, goals, lifeLog });

  assert.deepEqual(out.files.map((f) => f.id), ["f1"]);
  assert.deepEqual(out.removed.map((f) => f.id), ["f2", "f3"]);
  assert.deepEqual(out.goals[0].fileIds, ["f1"], "the goal loses only the removed file");
  assert.equal(out.lifeLog[0].fileIds, undefined, "an emptied list is dropped, not left as []");
  // f3 shares f1's stored object, which is still in use, so only f2's object is freed.
  assert.deepEqual(out.unusedPaths, [storagePath("u1", "sha-f2")]);
});

test("pruning with nothing to remove keeps the same lists", () => {
  const data = { files: [file("f1")], journal: [day("2026-11-10", ["f1"])], goals: [goal("g1")], lifeLog: [] };
  const out = pruneFiles(data);
  assert.equal(out.files, data.files);
  assert.equal(out.goals, data.goals);
  assert.deepEqual(out.unusedPaths, []);
});

test("restoring another account's backup drops files this account can't open, and their links", () => {
  const data = {
    files: [file("mine", "me"), file("theirs", "them")],
    journal: [day("2026-11-10", ["mine", "theirs"]), day("2026-11-11", ["theirs"])],
    goals: [goal("g1", ["theirs"])],
    lifeLog: [{ id: "l", date: "2026-11-10", fileIds: ["mine"] }],
  };
  const out = dropForeignFiles(data, "me");
  assert.deepEqual(out.files.map((f) => f.id), ["mine"]);
  assert.deepEqual(out.journal.map((e) => e.fileIds), [["mine"], undefined]);
  assert.equal(out.goals[0].fileIds, undefined);
  assert.deepEqual(out.lifeLog[0].fileIds, ["mine"]);
  assert.equal(dropForeignFiles(data, "them").files.length, 1);
  const own = { ...data, files: [file("mine", "me")] };
  assert.equal(dropForeignFiles(own, "me"), own, "same account: unchanged");
});

test("ids resolve to records in order, skipping any that are gone", () => {
  const files = [file("a"), file("b")];
  assert.deepEqual(filesByIds(files, ["b", "zz", "a"]).map((f) => f.id), ["b", "a"]);
  assert.deepEqual(filesByIds(files, undefined), []);
});
