"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CloudOff, Loader2, Paperclip, Replace, RotateCcw, Trash2, Upload, X } from "lucide-react";
import type { FileRecord, ISODate } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  ACCOUNT_FILE_QUOTA,
  FILE_ACCEPT,
  FILE_TYPES_SUMMARY,
  MAX_FILES_PER_ENTRY,
  MAX_FILE_BYTES,
  buildFileRefs,
  checkFile,
  describeLinks,
  formatBytes,
  storagePath,
  totalFileBytes,
} from "@/lib/files";
import { FileError, filesAvailable, prepareFile, uploadFile } from "@/lib/file-storage";
import { useAccount } from "@/components/account/account-session";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn, formatDate, uid } from "@/lib/utils";
import { FileAction, FileTile } from "./file-tile";
import { FilePreview } from "./file-preview";

interface Pending {
  key: string;
  name: string;
  size: number;
  status: "preparing" | "uploading" | "error";
  progress: number;
  error?: string;
  /** Kept so a failed upload can be retried without picking the file again. */
  file?: File;
  /** The attached file this upload will replace, if it's a replacement. */
  replaces?: string;
  abort?: AbortController;
}

/** A file uploaded while the composer was open: not saved to the journal yet. */
export interface SessionFile {
  record: FileRecord;
  /** True when this upload created the stored object (so cancelling may delete it). */
  created: boolean;
}

/**
 * The composer's attachments: add, preview, replace and remove files on a
 * journal day. Uploads start as soon as a file is picked, so progress is
 * visible and Save doesn't wait; nothing becomes part of the day until the
 * entry is saved.
 */
export function AttachmentTray({
  entryDate,
  otherDates,
  fileIds,
  onChange,
  sessionFiles,
  onSessionFile,
  onReplace,
  onBusyChange,
}: {
  entryDate: ISODate;
  /** Dates this draft does *not* own, when deciding whether a file is shared. */
  otherDates?: ISODate[];
  fileIds: string[];
  onChange: (ids: string[]) => void;
  sessionFiles: SessionFile[];
  onSessionFile: (f: SessionFile) => void;
  onReplace: (oldId: string, newId: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { mode, accountId } = useAccount();
  const stored = useChronicle((s) => s.files);
  const journal = useChronicle((s) => s.journal);
  const goals = useChronicle((s) => s.goals);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | undefined>(undefined);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<FileRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const enabled = filesAvailable && mode === "cloud";
  const all = useMemo(() => {
    const map = new Map<string, FileRecord>();
    for (const f of stored) map.set(f.id, f);
    for (const s of sessionFiles) map.set(s.record.id, s.record);
    return map;
  }, [stored, sessionFiles]);
  const attached = fileIds.map((id) => all.get(id)).filter((f): f is FileRecord => Boolean(f));
  const missing = fileIds.length - attached.length;
  const refs = useMemo(() => buildFileRefs({ journal, goals, lifeLog }), [journal, goals, lifeLog]);
  const used = totalFileBytes([...all.values()]);

  // Keep a live copy for async handlers, so a second file doesn't see a stale list.
  const idsRef = useRef(fileIds);
  idsRef.current = fileIds;

  const busy = pending.some((p) => p.status !== "error");
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  // Cancel uploads still running when the composer unmounts.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((p) => p.abort?.abort()), []);

  const update = (key: string, patch: Partial<Pending>) =>
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const drop = (key: string) => setPending((list) => list.filter((p) => p.key !== key));

  const attach = useCallback(
    (id: string, replaces?: string) => {
      const ids = idsRef.current;
      if (replaces && ids.includes(replaces)) {
        const next = ids.map((x) => (x === replaces ? id : x));
        onChange([...new Set(next)]);
        onReplace(replaces, id);
      } else if (!ids.includes(id)) {
        onChange([...ids, id]);
      }
    },
    [onChange, onReplace],
  );

  async function process(file: File, key: string, replaces?: string) {
    const check = checkFile(file);
    if (!check.ok) {
      update(key, { status: "error", error: check.reason, file: undefined });
      return;
    }
    try {
      update(key, { status: "preparing", progress: 0, error: undefined });
      const prepared = await prepareFile(file, check.def);
      // The same bytes already stored: point at them instead of uploading again.
      const existing = [...all.values()].find((f) => f.sha256 === prepared.sha256);
      if (existing) {
        if (idsRef.current.includes(existing.id) && existing.id !== replaces) {
          drop(key);
          setNotice(`“${existing.name}” is already attached to this day.`);
          return;
        }
        drop(key);
        attach(existing.id, replaces);
        const days = refs.get(existing.id)?.journal.filter((d) => d !== entryDate) ?? [];
        if (days.length) setNotice(`Linked the copy already stored with ${formatDate(days[0])}, so it isn't stored twice.`);
        return;
      }
      if (used + prepared.size > ACCOUNT_FILE_QUOTA) {
        update(key, {
          status: "error",
          error: `Your files would pass the ${formatBytes(ACCOUNT_FILE_QUOTA)} allowance (${formatBytes(used)} used). Remove some files first.`,
          file: undefined,
        });
        return;
      }
      const abort = new AbortController();
      update(key, { status: "uploading", progress: 0, abort, name: prepared.name, size: prepared.size });
      const outcome = await uploadFile(prepared, accountId, (f) => update(key, { progress: f }), abort.signal);
      const record: FileRecord = {
        id: uid("f"),
        sha256: prepared.sha256,
        path: outcome.path || storagePath(accountId, prepared.sha256),
        name: prepared.name,
        type: prepared.type,
        size: prepared.size,
        ...(prepared.width ? { width: prepared.width, height: prepared.height } : {}),
        addedAt: new Date().toISOString(),
      };
      onSessionFile({ record, created: outcome.created });
      drop(key);
      attach(record.id, replaces);
    } catch (e) {
      if (e instanceof FileError && e.kind === "cancelled") {
        drop(key);
        return;
      }
      const message = e instanceof Error ? e.message : "The file couldn't be attached.";
      const retryable = !(e instanceof FileError) || ["network", "server", "offline", "auth"].includes(e.kind);
      update(key, { status: "error", error: message, file: retryable ? file : undefined, abort: undefined });
    }
  }

  function add(list: FileList | File[], replaces?: string) {
    setNotice(null);
    const files = [...list];
    if (!files.length) return;
    const room = MAX_FILES_PER_ENTRY - idsRef.current.length - pending.filter((p) => p.status !== "error").length;
    const take = replaces ? files.slice(0, 1) : files.slice(0, Math.max(0, room));
    if (!replaces && files.length > take.length) {
      setNotice(`A day can hold up to ${MAX_FILES_PER_ENTRY} files${take.length ? `; the first ${take.length} were added` : ""}.`);
    }
    for (const file of take) {
      const key = uid("up");
      setPending((p) => [...p, { key, name: file.name, size: file.size, status: "preparing", progress: 0, file, replaces }]);
      void process(file, key, replaces);
    }
  }

  async function remove(record: FileRecord) {
    setNotice(null);
    const session = sessionFiles.some((s) => s.record.id === record.id);
    const r = refs.get(record.id);
    const elsewhere = (r?.journal ?? []).filter((d) => d !== entryDate && !(otherDates ?? []).includes(d));
    if (!session && !elsewhere.length) {
      const links = describeLinks({ goals: r?.goals ?? [], life: r?.life ?? [] });
      if (links) {
        const ok = await confirm({
          title: `Remove “${record.name}”?`,
          description: `It's also linked to ${links}. Files live in the journal, so removing it here deletes it there too once you save.`,
          confirmLabel: "Remove file",
        });
        if (!ok) return;
      }
    } else if (elsewhere.length) {
      setNotice(`“${record.name}” stays attached to ${formatDate(elsewhere[0])}${elsewhere.length > 1 ? ` and ${elsewhere.length - 1} other day${elsewhere.length > 2 ? "s" : ""}` : ""}.`);
    }
    onChange(idsRef.current.filter((id) => id !== record.id));
  }

  function pick(replaces?: string) {
    replaceTarget.current = replaces;
    inputRef.current?.click();
  }

  if (!enabled) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-paper/15 px-4 py-3 text-[0.8rem] text-paper/55">
        <CloudOff className="h-4 w-4 shrink-0" />
        {mode === "demo"
          ? "In your own account you can attach notes, photos and PDFs here. The demo saves nothing, so it has no files."
          : "Attachments are stored in your account's cloud space, which this build doesn't have."}
      </p>
    );
  }

  const full = fileIds.length >= MAX_FILES_PER_ENTRY;

  return (
    <div className="space-y-2.5">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="attachment-input"
        onChange={(e) => {
          if (e.target.files) add(e.target.files, replaceTarget.current);
          replaceTarget.current = undefined;
          e.target.value = "";
        }}
      />

      {(attached.length > 0 || pending.length > 0) && (
        <ul className="space-y-1.5">
          {attached.map((f) => {
            const others = (refs.get(f.id)?.journal ?? []).filter((d) => d !== entryDate);
            const r = refs.get(f.id);
            const links = describeLinks({ goals: r?.goals ?? [], life: r?.life ?? [] });
            return (
              <li key={f.id}>
                <FileTile
                  record={f}
                  onOpen={() => setPreview(f)}
                  note={
                    others.length || links
                      ? [others.length ? `Also on ${formatDate(others[0])}` : null, links ? `Linked to ${links}` : null]
                          .filter(Boolean)
                          .join(" · ")
                      : undefined
                  }
                  actions={
                    <>
                      <FileAction label={`Replace ${f.name}`} onClick={() => pick(f.id)}>
                        <Replace className="h-3.5 w-3.5" />
                      </FileAction>
                      <FileAction label={`Remove ${f.name}`} tone="danger" onClick={() => void remove(f)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </FileAction>
                    </>
                  }
                />
              </li>
            );
          })}
          {pending.map((p) => (
            <li
              key={p.key}
              className={cn(
                "rounded-xl border p-2.5",
                p.status === "error" ? "border-danger/30 bg-danger/[0.06]" : "border-line bg-paper/[0.02]",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line",
                    p.status === "error" ? "text-danger" : "text-accent",
                  )}
                >
                  {p.status === "error" ? <AlertCircle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-paper">
                    {p.replaces ? "Replacing with " : ""}
                    {p.name}
                  </p>
                  {p.status === "error" ? (
                    <p className="text-[0.72rem] leading-snug text-danger" role="alert">
                      {p.error}
                    </p>
                  ) : (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper/10">
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-200"
                          style={{ width: `${Math.round((p.status === "preparing" ? 0.04 : p.progress) * 100)}%` }}
                        />
                      </div>
                      <span className="tabular w-16 text-right text-[0.68rem] text-paper/50">
                        {p.status === "preparing" ? "Preparing" : `${Math.round(p.progress * 100)}%`}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {p.status === "error" && p.file && (
                    <FileAction label={`Retry ${p.name}`} onClick={() => void process(p.file!, p.key, p.replaces)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </FileAction>
                  )}
                  <FileAction
                    label={p.status === "error" ? `Dismiss ${p.name}` : `Cancel ${p.name}`}
                    onClick={() => {
                      p.abort?.abort();
                      drop(p.key);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </FileAction>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {missing > 0 && (
        <p className="text-[0.72rem] text-paper/50">
          {missing} file{missing === 1 ? " is" : "s are"} no longer stored and will be dropped when you save.
        </p>
      )}

      {notice && (
        <p className="text-[0.72rem] text-paper/60" role="status">
          {notice}
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!full && e.dataTransfer.files?.length) add(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-4 text-center transition-colors sm:flex-row sm:text-left",
          dragging ? "border-accent bg-accent/[0.06]" : "border-paper/15",
          full && "opacity-60",
        )}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          {dragging ? <Upload className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-medium text-paper/80">
            {full ? `This day has the most files it can hold (${MAX_FILES_PER_ENTRY}).` : "Drop files here, or"}{" "}
            {!full && (
              <button type="button" onClick={() => pick()} className="font-semibold text-accent hover:underline">
                choose files
              </button>
            )}
          </p>
          <p className="text-[0.68rem] text-paper/45">
            {FILE_TYPES_SUMMARY}, up to {formatBytes(MAX_FILE_BYTES)} each. Photos are resized. {formatBytes(used)} of{" "}
            {formatBytes(ACCOUNT_FILE_QUOTA)} used.
          </p>
        </div>
      </div>

      <FilePreview record={preview} open={Boolean(preview)} onClose={() => setPreview(null)} />
    </div>
  );
}
