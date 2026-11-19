import type { ChronicleData, FileKind, FileRecord, Goal, ISODate, JournalEntry, LifeEntry, Reflection } from "./types";

/* ════════════════════════════════════════════════════════════════
   ATTACHED FILES — the rules, as pure functions.

   Bytes live in Supabase Storage (lib/file-storage.ts does the network
   part); only `FileRecord`s travel in the synced snapshot. Three rules:

   1. A file belongs to the journal day or the diary entry it was attached
      to. It exists while at least one of them lists it. Goals and Life
      Dashboard days only point at it.
   2. One file, one copy. Records are unique by content hash and stored at
      `<user id>/<sha256>`, so attaching the same file twice, on any day
      or any device, never uploads or stores it again.
   3. Nothing is deleted while something still uses it. Removing a file
      from a goal or a life day only drops the link; removing it from the
      last journal day or diary entry that holds it is what deletes it, and
      the UI says which goals and days will lose it before that happens.
   ════════════════════════════════════════════════════════════════ */

/** The private Storage bucket. Created by supabase/migrations/…_attachments.sql. */
export const FILE_BUCKET = "chronicle-attachments";

/** Per stored file, after images are downscaled. The bucket enforces the same limit. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** A photo straight off a phone is often 4–12 MB; it is accepted and downscaled. */
export const MAX_IMAGE_INPUT_BYTES = 25 * 1024 * 1024;

export const MAX_FILES_PER_ENTRY = 10;

/**
 * A soft cap per account, so a handful of people stay well inside Supabase's
 * free 1 GB of file storage. Checked before every upload.
 */
export const ACCOUNT_FILE_QUOTA = 100 * 1024 * 1024;

export interface FileTypeDef {
  ext: string[];
  type: string;
  kind: FileKind;
  label: string;
}

/** What can be attached. The bucket's `allowed_mime_types` lists the same types. */
export const FILE_TYPES: FileTypeDef[] = [
  { ext: ["jpg", "jpeg"], type: "image/jpeg", kind: "image", label: "JPEG image" },
  { ext: ["png"], type: "image/png", kind: "image", label: "PNG image" },
  { ext: ["webp"], type: "image/webp", kind: "image", label: "WebP image" },
  { ext: ["gif"], type: "image/gif", kind: "image", label: "GIF image" },
  { ext: ["pdf"], type: "application/pdf", kind: "pdf", label: "PDF" },
  { ext: ["txt"], type: "text/plain", kind: "text", label: "Text file" },
  { ext: ["md", "markdown"], type: "text/markdown", kind: "text", label: "Markdown" },
  { ext: ["csv"], type: "text/csv", kind: "text", label: "CSV" },
  {
    ext: ["docx"],
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document",
    label: "Word document",
  },
  {
    ext: ["xlsx"],
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "document",
    label: "Excel workbook",
  },
  {
    ext: ["pptx"],
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    kind: "document",
    label: "PowerPoint",
  },
];

export const ALLOWED_FILE_TYPES = FILE_TYPES.map((t) => t.type);

/** For `<input type="file" accept>`: every type and extension above. */
export const FILE_ACCEPT = [
  ...ALLOWED_FILE_TYPES,
  ...FILE_TYPES.flatMap((t) => t.ext.map((e) => `.${e}`)),
].join(",");

/** Human list for help text: "images, PDF, text, Word, Excel and PowerPoint". */
export const FILE_TYPES_SUMMARY = "Images, PDF, text, Markdown, CSV, Word, Excel and PowerPoint";

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,10})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * The type a file will be stored as. The extension decides when it is one we
 * know, because browsers disagree about types — Windows reports a CSV as an
 * Excel file, and many systems report Markdown as nothing at all.
 */
export function resolveFileType(name: string, browserType: string): FileTypeDef | null {
  const ext = extensionOf(name);
  const byExt = ext ? FILE_TYPES.find((t) => t.ext.includes(ext)) : undefined;
  if (byExt) return byExt;
  const type = browserType.toLowerCase().split(";")[0].trim();
  return FILE_TYPES.find((t) => t.type === type) ?? null;
}

export type FileCheck =
  | { ok: true; def: FileTypeDef }
  | { ok: false; reason: string };

/** Can this file be attached at all? Images are size-checked again after downscaling. */
export function checkFile(file: { name: string; type: string; size: number }): FileCheck {
  const def = resolveFileType(file.name, file.type);
  if (!def) {
    return { ok: false, reason: `“${shortName(file.name)}” isn't a supported type. ${FILE_TYPES_SUMMARY} can be attached.` };
  }
  if (file.size === 0) return { ok: false, reason: `“${shortName(file.name)}” is empty.` };
  const limit = def.kind === "image" && def.type !== "image/gif" ? MAX_IMAGE_INPUT_BYTES : MAX_FILE_BYTES;
  if (file.size > limit) {
    return {
      ok: false,
      reason: `“${shortName(file.name)}” is ${formatBytes(file.size)}. Files can be up to ${formatBytes(limit)}.`,
    };
  }
  return { ok: true, def };
}

export function fileKind(type: string): FileKind {
  return FILE_TYPES.find((t) => t.type === type)?.kind ?? "document";
}

export function fileTypeLabel(record: Pick<FileRecord, "type" | "name">): string {
  return (
    FILE_TYPES.find((t) => t.type === record.type)?.label ??
    (extensionOf(record.name).toUpperCase() || "File")
  );
}

/** Previewable in the app (rather than download-only). */
export function canPreview(type: string): boolean {
  const kind = fileKind(type);
  return kind === "image" || kind === "text" || kind === "pdf";
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** A file name safe to show and to suggest on download: no paths, no control characters. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "file";
  if (cleaned.length <= 120) return cleaned;
  const ext = extensionOf(cleaned);
  return ext ? `${cleaned.slice(0, 110).trim()}….${ext}` : `${cleaned.slice(0, 118)}…`;
}

function shortName(name: string): string {
  const n = cleanFileName(name);
  return n.length > 40 ? `${n.slice(0, 37)}…` : n;
}

/** Where a file's bytes live in the bucket. The first folder must be the owner's id. */
export function storagePath(userId: string, sha256: string): string {
  return `${userId}/${sha256}`;
}

export function totalFileBytes(files: FileRecord[]): number {
  return files.reduce((a, f) => a + (f.size || 0), 0);
}

/* ── references ──────────────────────────────────────────────── */

export interface FileRefs {
  /** Journal days holding the file, oldest first. */
  journal: ISODate[];
  goals: { id: string; title: string }[];
  /** Life Dashboard days pointing at it. */
  life: ISODate[];
  /** Personal Diary entries holding it. */
  diary: { id: string; date: ISODate; title?: string }[];
}

type RefData = {
  journal: Pick<JournalEntry, "date" | "fileIds">[];
  goals: Pick<Goal, "id" | "title" | "fileIds">[];
  lifeLog: Pick<LifeEntry, "date" | "fileIds">[];
  reflections?: Pick<Reflection, "id" | "date" | "title" | "fileIds">[];
};

/** Every file's users, in one pass. */
export function buildFileRefs(data: RefData): Map<string, FileRefs> {
  const out = new Map<string, FileRefs>();
  const at = (id: string) => {
    let r = out.get(id);
    if (!r) {
      r = { journal: [], goals: [], life: [], diary: [] };
      out.set(id, r);
    }
    return r;
  };
  for (const e of data.journal) for (const id of e.fileIds ?? []) at(id).journal.push(e.date);
  for (const g of data.goals) for (const id of g.fileIds ?? []) at(id).goals.push({ id: g.id, title: g.title });
  for (const l of data.lifeLog) for (const id of l.fileIds ?? []) at(id).life.push(l.date);
  for (const d of data.reflections ?? []) for (const id of d.fileIds ?? []) at(id).diary.push({ id: d.id, date: d.date, title: d.title });
  for (const r of out.values()) {
    r.journal.sort();
    r.life.sort();
  }
  return out;
}

export function fileRefs(data: RefData, fileId: string): FileRefs {
  return buildFileRefs(data).get(fileId) ?? { journal: [], goals: [], life: [], diary: [] };
}

/** "Goal ‘Finish Polity’ and 2 Life Dashboard days" — for a confirmation. */
export function describeLinks(refs: Pick<FileRefs, "goals" | "life">): string | null {
  const parts: string[] = [];
  if (refs.goals.length === 1) parts.push(`the goal “${refs.goals[0].title}”`);
  else if (refs.goals.length > 1) parts.push(`${refs.goals.length} goals`);
  if (refs.life.length === 1) parts.push("1 Life Dashboard day");
  else if (refs.life.length > 1) parts.push(`${refs.life.length} Life Dashboard days`);
  return parts.length ? parts.join(" and ") : null;
}

export interface PruneResult {
  files: FileRecord[];
  goals: Goal[];
  lifeLog: LifeEntry[];
  /** Records that were dropped because no journal day holds them any more. */
  removed: FileRecord[];
  /** Storage paths no remaining record uses: safe to delete from the bucket. */
  unusedPaths: string[];
}

/**
 * Applies rule 1: drops every record no journal day holds, along with the
 * links goals and life days had to it, and reports which stored objects are
 * now unused. Lists that don't change keep their identity, so a no-op prune
 * doesn't wake every subscriber.
 */
export function pruneFiles(
  data: Pick<ChronicleData, "files" | "journal" | "goals" | "lifeLog"> & {
    reflections?: Pick<Reflection, "fileIds">[];
  },
): PruneResult {
  const held = new Set<string>();
  for (const e of data.journal) for (const id of e.fileIds ?? []) held.add(id);
  // Diary entries own their files too.
  for (const d of data.reflections ?? []) for (const id of d.fileIds ?? []) held.add(id);
  const removed = data.files.filter((f) => !held.has(f.id));
  if (!removed.length) {
    return { files: data.files, goals: data.goals, lifeLog: data.lifeLog, removed, unusedPaths: [] };
  }
  const gone = new Set(removed.map((f) => f.id));
  const files = data.files.filter((f) => !gone.has(f.id));
  const strip = <T extends { fileIds?: string[] }>(item: T): T => {
    if (!item.fileIds?.some((id) => gone.has(id))) return item;
    const fileIds = item.fileIds.filter((id) => !gone.has(id));
    const next = { ...item };
    if (fileIds.length) next.fileIds = fileIds;
    else delete next.fileIds;
    return next;
  };
  const goals = data.goals.map(strip);
  const lifeLog = data.lifeLog.map(strip);
  const stillUsed = new Set(files.map((f) => f.path));
  const unusedPaths = [...new Set(removed.map((f) => f.path))].filter((p) => !stillUsed.has(p));
  return { files, goals, lifeLog, removed, unusedPaths };
}

/**
 * A backup restored into a different account carries file records whose bytes
 * sit in the other account's folder, which this account can never read. Drops
 * those records and every link to them; a restore into the same account keeps
 * everything.
 */
export function dropForeignFiles<
  T extends {
    files?: FileRecord[];
    journal?: JournalEntry[];
    goals?: Goal[];
    lifeLog?: LifeEntry[];
    reflections?: Reflection[];
  },
>(data: T, userId: string): T {
  if (!data.files?.length) return data;
  const own = `${userId}/`;
  const foreign = new Set(data.files.filter((f) => !f.path.startsWith(own)).map((f) => f.id));
  if (!foreign.size) return data;
  const strip = <I extends { fileIds?: string[] }>(item: I): I => {
    if (!item.fileIds?.some((id) => foreign.has(id))) return item;
    const next = { ...item, fileIds: item.fileIds.filter((id) => !foreign.has(id)) };
    if (!next.fileIds.length) delete (next as { fileIds?: string[] }).fileIds;
    return next;
  };
  return {
    ...data,
    files: data.files.filter((f) => !foreign.has(f.id)),
    ...(data.journal ? { journal: data.journal.map(strip) } : {}),
    ...(data.goals ? { goals: data.goals.map(strip) } : {}),
    ...(data.lifeLog ? { lifeLog: data.lifeLog.map(strip) } : {}),
    ...(data.reflections ? { reflections: data.reflections.map(strip) } : {}),
  };
}

/** Records in display order: newest first. */
export function sortFilesNewest(files: FileRecord[]): FileRecord[] {
  return [...files].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

/** The records a list of ids points at, in the list's order, skipping any that are gone. */
export function filesByIds(files: FileRecord[], ids: string[] | undefined): FileRecord[] {
  if (!ids?.length) return [];
  const byId = new Map(files.map((f) => [f.id, f]));
  return ids.map((id) => byId.get(id)).filter((f): f is FileRecord => Boolean(f));
}
