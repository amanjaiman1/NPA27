import type { ISODate, Reflection } from "./types";
import { fromISODate } from "./utils";

/* ════════════════════════════════════════════════════════════════
   THE PERSONAL DIARY
   Private writing, kept apart from the study record. The entries keep
   their old type and store key (`Reflection`, `reflections`) so every
   reflection written before is a diary entry as it stands.

   What the app does with an entry's words: shows them to you, finds them
   when you search, and exports them when you ask. Nothing else reads
   them. There is no mood scoring or sentiment reading, no review or
   coach input, no habit counting, and the server's reminder dispatcher
   receives only the dates (supabase/migrations/20261202120000_*).

   Formatting is a light Markdown kept as plain text: **bold**, *italic*,
   "## " headings, "- " and "1. " lists and "> " quotes. It is parsed
   here into plain blocks and drawn as React elements, never as HTML, so
   nothing in an entry can run.
   ════════════════════════════════════════════════════════════════ */

export const DIARY_CATEGORIES = ["Daily note", "Reflection", "Gratitude", "Worry", "Idea", "Letter to myself", "Other"] as const;

/** Words the older reflection journal used for its 1-5 mood, shown on those entries. */
export const MOOD_WORDS = ["", "Heavy", "Low", "Even", "Light", "Soaring"];

/** Optional prompts, grouped by what they're for. */
export const PROMPT_GROUPS: { group: string; prompts: string[] }[] = [
  {
    group: "Looking inward",
    prompts: [
      "What did today teach me about myself?",
      "What am I avoiding, and why?",
      "What is the fear underneath my procrastination?",
      "Which story about myself is no longer true?",
    ],
  },
  {
    group: "The work",
    prompts: [
      "Where did I feel most alive in my studies today?",
      "What did I do today that the version of me from a year ago couldn't?",
      "What would I change about how I studied this week?",
    ],
  },
  {
    group: "Weight and worry",
    prompts: [
      "What would I tell a friend who had my day?",
      "What am I carrying that isn't mine to carry?",
      "What is the worst that happens, honestly?",
      "Who could I have leaned on today and didn't?",
    ],
  },
  {
    group: "Gratitude",
    prompts: [
      "What is one thing I'm grateful for right now?",
      "Who made today easier without being asked?",
      "What small thing went right that I nearly missed?",
    ],
  },
];

export const ALL_PROMPTS = PROMPT_GROUPS.flatMap((g) => g.prompts);

/** A prompt chosen from the date: the same all day, different tomorrow. */
export function promptOfTheDay(today: ISODate): string {
  const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ALL_PROMPTS[seed % ALL_PROMPTS.length];
}

/* ── Light Markdown ──────────────────────────────────────────── */

export type Inline = { kind: "text" | "strong" | "em"; text: string };

export type Block =
  | { kind: "p"; lines: Inline[][] }
  | { kind: "h"; text: Inline[] }
  | { kind: "quote"; lines: Inline[][] }
  | { kind: "ul" | "ol"; items: Inline[][] };

/** `**bold**` and `*italic*` (or `_italic_`) within a line. Anything else is text. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "strong", text: m[1] });
    else out.push({ kind: "em", text: m[2] ?? m[3] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
}

/** An entry's text as blocks: paragraphs, headings, lists and quotes. */
export function parseDiary(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "h", text: parseInline(heading[1]) });
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: Inline[][] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(parseInline(lines[i++].replace(/^>\s?/, "")));
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(parseInline(lines[i++].replace(/^\s*[-*•]\s+/, "")));
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(parseInline(lines[i++].replace(/^\s*\d+[.)]\s+/, "")));
      blocks.push({ kind: "ol", items });
      continue;
    }
    const para: Inline[][] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    )
      para.push(parseInline(lines[i++]));
    blocks.push({ kind: "p", lines: para });
  }
  return blocks;
}

/** The words without the formatting marks: for counting, excerpts and search. */
export function plainText(text: string): string {
  return text
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

export function wordCount(text: string): number {
  const words = plainText(text).trim().match(/[\p{L}\p{N}'’-]+/gu);
  return words ? words.length : 0;
}

export function charCount(text: string): number {
  return [...plainText(text)].length;
}

/* ── Entries ─────────────────────────────────────────────────── */

/** What to call an entry in a list: its title, else its first line, else its date. */
export function entryTitle(r: Pick<Reflection, "title" | "content" | "prompt" | "date">): string {
  if (r.title?.trim()) return r.title.trim();
  const first = plainText(r.content).split("\n").find((l) => l.trim());
  if (first) return first.trim().length > 70 ? `${first.trim().slice(0, 68)}…` : first.trim();
  if (r.prompt?.trim()) return r.prompt.trim();
  return `Entry for ${fromISODate(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
}

/** A line of the entry for a list. Untitled entries are named by their first line, so this starts after it. */
export function excerpt(r: Pick<Reflection, "title" | "content">, n = 160): string {
  let body = plainText(r.content);
  if (!r.title?.trim()) {
    const lines = body.split("\n");
    body = lines.slice(lines.findIndex((l) => l.trim()) + 1).join(" ");
  }
  body = body.replace(/\s+/g, " ").trim();
  return body.length > n ? `${body.slice(0, n - 1)}…` : body;
}

/** Newest first, pinned on top. */
export function sortEntries(list: Reflection[]): Reflection[] {
  return [...list].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      b.date.localeCompare(a.date) ||
      (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""),
  );
}

export interface DiaryFilter {
  query: string;
  category: string;
  tag: string;
  flag: "all" | "pinned" | "important" | "files";
  /** One day, from the calendar. */
  date: ISODate | null;
}

export const NO_DIARY_FILTER: DiaryFilter = { query: "", category: "", tag: "", flag: "all", date: null };

export function filterEntries(list: Reflection[], f: DiaryFilter): Reflection[] {
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((r) => {
    if (f.date && r.date !== f.date) return false;
    if (f.category && (r.category ?? "") !== f.category) return false;
    if (f.tag && !(r.tags ?? []).includes(f.tag)) return false;
    if (f.flag === "pinned" && !r.pinned) return false;
    if (f.flag === "important" && !r.important) return false;
    if (f.flag === "files" && !(r.fileIds ?? []).length) return false;
    if (!words.length) return true;
    const hay = [r.title, plainText(r.content), r.prompt, r.category, ...(r.tags ?? []), ...(r.gratitude ?? [])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function allTags(list: Reflection[]): string[] {
  const counts = new Map<string, number>();
  for (const r of list) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/** A tag as typed, tidied: "  Exam Stress " is "exam stress". */
export function cleanTag(t: string): string {
  return t.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase().slice(0, 32);
}

/** Entries grouped by month, newest month first, for the timeline. */
export function byMonth(list: Reflection[]): { key: string; label: string; entries: Reflection[] }[] {
  const groups = new Map<string, Reflection[]>();
  for (const r of [...list].sort((a, b) => b.date.localeCompare(a.date))) {
    const key = r.date.slice(0, 7);
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.entries()].map(([key, entries]) => ({
    key,
    label: fromISODate(`${key}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    entries,
  }));
}

/** One entry as Markdown, for keeping outside the app. */
export function entryMarkdown(r: Reflection, fileNames: Map<string, string> = new Map()): string {
  const lines = [`# ${entryTitle(r)}`, "", r.date];
  const meta = [r.category, ...(r.tags ?? []).map((t) => `#${t}`)].filter(Boolean);
  if (meta.length) lines.push(meta.join(" "));
  lines.push("");
  if (r.prompt) lines.push(`> ${r.prompt}`, "");
  lines.push(r.content.trim(), "");
  if (r.gratitude?.length) lines.push("Grateful for:", ...r.gratitude.map((g) => `- ${g}`), "");
  if (r.fileIds?.length) lines.push("Attachments:", ...r.fileIds.map((id) => `- ${fileNames.get(id) ?? "A file"}`), "");
  return lines.join("\n");
}

export function diaryExport(list: Reflection[], fileNames: Map<string, string> = new Map()): string {
  return sortEntries(list)
    .map((r) => entryMarkdown(r, fileNames))
    .join("\n---\n\n");
}

/* ── The editor's toolbar ────────────────────────────────────── */

export type FormatAction = "bold" | "italic" | "heading" | "bullet" | "number" | "quote";

const LINE_MARK: Record<Exclude<FormatAction, "bold" | "italic">, RegExp> = {
  heading: /^#{1,3}\s+/,
  bullet: /^\s*[-*•]\s+/,
  number: /^\s*\d+[.)]\s+/,
  quote: /^>\s?/,
};
const ANY_LINE_MARK = /^(#{1,3}\s+|>\s?|\s*[-*•]\s+|\s*\d+[.)]\s+)/;

/**
 * Formatting for the selected text, as the Markdown marks it is kept in:
 * bold and italic wrap the selection (or unwrap it), the rest mark each
 * selected line (or unmark it, if every line already has that mark).
 */
export function applyFormat(value: string, start: number, end: number, action: FormatAction): { value: string; start: number; end: number } {
  if (action === "bold" || action === "italic") {
    const mark = action === "bold" ? "**" : "*";
    const selected = value.slice(start, end);
    const wrapped =
      value.slice(start - mark.length, start) === mark &&
      value.slice(end, end + mark.length) === mark &&
      (action === "bold" || (value[start - 2] !== "*" && value[end + 1] !== "*"));
    if (wrapped) {
      return {
        value: value.slice(0, start - mark.length) + selected + value.slice(end + mark.length),
        start: start - mark.length,
        end: end - mark.length,
      };
    }
    const text = selected || (action === "bold" ? "bold text" : "italic text");
    return { value: value.slice(0, start) + mark + text + mark + value.slice(end), start: start + mark.length, end: start + mark.length + text.length };
  }
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + (start > 0 ? 1 : 0);
  const from = start === 0 ? 0 : lineStart;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;
  const block = value.slice(from, lineEnd);
  const lines = block.split("\n");
  const own = LINE_MARK[action];
  const filled = lines.filter((l) => l.trim());
  const undo = filled.length > 0 && filled.every((l) => own.test(l));
  let n = 0;
  const out = lines.map((l) => {
    if (undo) return l.replace(own, "");
    if (!l.trim() && lines.length > 1) return l;
    n++;
    const mark = action === "heading" ? "## " : action === "bullet" ? "- " : action === "quote" ? "> " : `${n}. `;
    return mark + l.replace(ANY_LINE_MARK, "");
  });
  const replaced = out.join("\n");
  const delta = replaced.length - block.length;
  const next = value.slice(0, from) + replaced + value.slice(lineEnd);
  return lines.length === 1
    ? { value: next, start: Math.max(from, start + delta), end: Math.max(from, end + delta) }
    : { value: next, start: from, end: lineEnd + delta };
}
