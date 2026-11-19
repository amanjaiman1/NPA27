import { test } from "node:test";
import assert from "node:assert/strict";
import type { Reflection } from "@/lib/types";
import {
  ALL_PROMPTS,
  NO_DIARY_FILTER,
  applyFormat,
  byMonth,
  cleanTag,
  entryMarkdown,
  entryTitle,
  excerpt,
  filterEntries,
  parseDiary,
  parseInline,
  plainText,
  promptOfTheDay,
  sortEntries,
  wordCount,
} from "@/lib/diary";

const entry = (over: Partial<Reflection> & { id: string }): Reflection => ({ date: "2026-11-18", content: "", ...over });

/* ── reading the light Markdown ──────────────────────────────── */

test("bold and italic are read inside a line, and anything else stays text", () => {
  assert.deepEqual(parseInline("A **long** day, *finally* over_"), [
    { kind: "text", text: "A " },
    { kind: "strong", text: "long" },
    { kind: "text", text: " day, " },
    { kind: "em", text: "finally" },
    { kind: "text", text: " over_" },
  ]);
  assert.deepEqual(parseInline("2 * 3 = 6"), [{ kind: "text", text: "2 * 3 = 6" }]);
});

test("an entry becomes headings, paragraphs, lists and quotes", () => {
  const blocks = parseDiary("## Today\nWoke early.\nRead the paper.\n\n- Polity\n- Economy\n\n1. Revise\n2) Rest\n> Keep going");
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["h", "p", "ul", "ol", "quote"],
  );
  assert.equal(blocks[1].kind === "p" && blocks[1].lines.length, 2);
  assert.equal(blocks[2].kind === "ul" && blocks[2].items.length, 2);
  assert.equal(blocks[3].kind === "ol" && blocks[3].items.length, 2);
  // Windows line endings read the same.
  assert.deepEqual(parseDiary("One\r\nTwo"), parseDiary("One\nTwo"));
});

test("counts and excerpts ignore the formatting marks", () => {
  const text = "## A *good* day\n- **Two** mocks\n> Don't stop";
  assert.equal(plainText(text), "A good day\nTwo mocks\nDon't stop");
  assert.equal(wordCount(text), 7);
  assert.equal(wordCount(""), 0);
});

test("an untitled entry is named by its first line, and its excerpt starts after it", () => {
  const e = entry({ id: "1", content: "## Hard morning\nCouldn't focus until noon.\nThen it clicked." });
  assert.equal(entryTitle(e), "Hard morning");
  assert.equal(excerpt(e), "Couldn't focus until noon. Then it clicked.");
  assert.equal(entryTitle(entry({ id: "2", title: "  Mock day  ", content: "x" })), "Mock day");
  assert.equal(entryTitle(entry({ id: "3", prompt: "What went well?" })), "What went well?");
  assert.equal(entryTitle(entry({ id: "4" })), "Entry for 18 November 2026");
  assert.equal(entryTitle(entry({ id: "5", content: "x".repeat(80) })).length, 69);
});

/* ── the toolbar ─────────────────────────────────────────────── */

test("bold wraps the selection, and pressing it again unwraps it", () => {
  const on = applyFormat("a good day", 2, 6, "bold");
  assert.deepEqual(on, { value: "a **good** day", start: 4, end: 8 });
  assert.deepEqual(applyFormat(on.value, on.start, on.end, "bold"), { value: "a good day", start: 2, end: 6 });
  // Nothing selected: a placeholder to type over.
  assert.deepEqual(applyFormat("", 0, 0, "italic"), { value: "*italic text*", start: 1, end: 12 });
});

test("line marks apply to every selected line, and toggle off together", () => {
  const listed = applyFormat("Polity\nEconomy", 0, 14, "bullet");
  assert.equal(listed.value, "- Polity\n- Economy");
  assert.equal(applyFormat(listed.value, 0, listed.value.length, "bullet").value, "Polity\nEconomy");
  // Numbering counts the lines, and replaces another line mark.
  assert.equal(applyFormat("- Polity\n- Economy", 0, 18, "number").value, "1. Polity\n2. Economy");
  // A heading on the line the cursor is in.
  assert.equal(applyFormat("One\nTwo", 5, 5, "heading").value, "One\n## Two");
});

/* ── finding entries ─────────────────────────────────────────── */

test("tags are tidied, and filters combine words, tags and flags", () => {
  assert.equal(cleanTag("  #Exam   Stress "), "exam stress");
  const list = [
    entry({ id: "a", content: "Revised **polity** all day", tags: ["calm"], pinned: true }),
    entry({ id: "b", content: "Anxious before the mock", tags: ["exam stress"], important: true, date: "2026-11-10" }),
    entry({ id: "c", content: "A walk", fileIds: ["f1"], date: "2026-10-30" }),
  ];
  const ids = (f: Partial<typeof NO_DIARY_FILTER>) => filterEntries(list, { ...NO_DIARY_FILTER, ...f }).map((r) => r.id);
  assert.deepEqual(ids({ query: "POLITY day" }), ["a"]);
  assert.deepEqual(ids({ tag: "exam stress" }), ["b"]);
  assert.deepEqual(ids({ flag: "files" }), ["c"]);
  assert.deepEqual(ids({ flag: "important", query: "mock" }), ["b"]);
  assert.deepEqual(ids({ date: "2026-11-10" }), ["b"]);
  assert.deepEqual(
    sortEntries(list).map((r) => r.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    byMonth(list).map((g) => [g.key, g.label, g.entries.length]),
    [
      ["2026-11", "November 2026", 2],
      ["2026-10", "October 2026", 1],
    ],
  );
});

test("an entry exports as Markdown with its prompt, tags and attachment names", () => {
  const e = entry({
    id: "a",
    title: "Sunday",
    prompt: "What are you grateful for?",
    content: "  The quiet.  ",
    category: "Gratitude",
    tags: ["calm"],
    gratitude: ["Tea"],
    fileIds: ["f1", "gone"],
  });
  assert.equal(
    entryMarkdown(e, new Map([["f1", "notes.pdf"]])),
    "# Sunday\n\n2026-11-18\nGratitude #calm\n\n> What are you grateful for?\n\nThe quiet.\n\nGrateful for:\n- Tea\n\nAttachments:\n- notes.pdf\n- A file\n",
  );
});

test("the day's prompt is the same all day and one of the prompts", () => {
  assert.equal(promptOfTheDay("2026-11-19"), promptOfTheDay("2026-11-19"));
  assert.ok(ALL_PROMPTS.includes(promptOfTheDay("2026-11-19")));
});
