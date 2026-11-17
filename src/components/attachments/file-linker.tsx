"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Link2, Paperclip, Search, Unlink } from "lucide-react";
import type { FileRecord, ISODate } from "@/lib/types";
import { useChronicle, type FileLinkTarget } from "@/lib/store";
import { buildFileRefs, fileKind, filesByIds } from "@/lib/files";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { cn, formatDate } from "@/lib/utils";
import { FileAction, FileThumb, FileTile, fileMeta } from "./file-tile";
import { FilePreview } from "./file-preview";

type KindFilter = "all" | "image" | "pdf" | "other";

/**
 * Lets a goal or a Life Dashboard day point at files already in the journal.
 * Nothing is uploaded here and nothing is copied: linking adds a reference,
 * unlinking removes it, and the file stays with its journal day either way.
 */
export function FileLinker({
  target,
  fileIds,
  suggestDate,
  emptyHint,
}: {
  target: FileLinkTarget;
  fileIds: string[] | undefined;
  /** Files from this journal day are offered first (a life day's own date). */
  suggestDate?: ISODate;
  emptyHint?: string;
}) {
  const files = useChronicle((s) => s.files);
  const journal = useChronicle((s) => s.journal);
  const goals = useChronicle((s) => s.goals);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const linkFiles = useChronicle((s) => s.linkFiles);
  const unlinkFile = useChronicle((s) => s.unlinkFile);
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState<FileRecord | null>(null);

  const refs = useMemo(() => buildFileRefs({ journal, goals, lifeLog }), [journal, goals, lifeLog]);
  const linked = filesByIds(files, fileIds);

  return (
    <div className="space-y-2">
      {linked.length > 0 ? (
        <ul className="space-y-1.5">
          {linked.map((f) => {
            const day = refs.get(f.id)?.journal[0];
            return (
              <li key={f.id}>
                <FileTile
                  record={f}
                  onOpen={() => setPreview(f)}
                  note={
                    day ? (
                      <Link href={`/journal/${day}`} className="hover:text-accent">
                        From your journal · {formatDate(day)}
                      </Link>
                    ) : undefined
                  }
                  actions={
                    <FileAction label={`Unlink ${f.name}`} onClick={() => unlinkFile(target, f.id)}>
                      <Unlink className="h-3.5 w-3.5" />
                    </FileAction>
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[0.75rem] text-paper/50">{emptyHint ?? "No files linked."}</p>
      )}
      <Button variant="outline" size="sm" onClick={() => setPicking(true)} disabled={!files.length}>
        <Link2 className="h-3.5 w-3.5" />
        {files.length ? "Link a file from the journal" : "No journal files yet"}
      </Button>
      {!files.length && (
        <p className="text-[0.7rem] text-paper/45">Attach files to a journal day first; they can then be linked here.</p>
      )}

      <FilePicker
        open={picking}
        onClose={() => setPicking(false)}
        exclude={new Set(fileIds ?? [])}
        suggestDate={suggestDate}
        onPick={(ids) => {
          linkFiles(target, ids);
          setPicking(false);
        }}
      />
      <FilePreview record={preview} open={Boolean(preview)} onClose={() => setPreview(null)} />
    </div>
  );
}

/** Choose journal files, newest day first, with the suggested day on top. */
export function FilePicker({
  open,
  onClose,
  onPick,
  exclude,
  suggestDate,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (ids: string[]) => void;
  exclude: Set<string>;
  suggestDate?: ISODate;
}) {
  const files = useChronicle((s) => s.files);
  const journal = useChronicle((s) => s.journal);
  const goals = useChronicle((s) => s.goals);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const refs = buildFileRefs({ journal, goals, lifeLog });
    const q = query.trim().toLowerCase();
    const byDay = new Map<ISODate, FileRecord[]>();
    for (const f of files) {
      if (q && !f.name.toLowerCase().includes(q)) continue;
      const k = fileKind(f.type);
      if (kind === "image" && k !== "image") continue;
      if (kind === "pdf" && k !== "pdf") continue;
      if (kind === "other" && (k === "image" || k === "pdf")) continue;
      const day = refs.get(f.id)?.journal.at(-1) ?? f.addedAt.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(f);
      byDay.set(day, list);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a === suggestDate ? -1 : b === suggestDate ? 1 : b.localeCompare(a)))
      .map(([day, list]) => ({ day, list: list.sort((a, b) => b.addedAt.localeCompare(a.addedAt)) }));
  }, [files, journal, goals, lifeLog, query, kind, suggestDate]);

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function close() {
    setChosen(new Set());
    setQuery("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Link files from your journal"
      description="The file stays with its journal day. Linking never makes a copy."
      className="sm:max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onPick([...chosen]);
              setChosen(new Set());
            }}
            disabled={!chosen.size}
          >
            <Link2 className="h-4 w-4" /> Link {chosen.size || ""} file{chosen.size === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search file names…" className="pl-10" />
        </div>
        <Segmented
          value={kind}
          onChange={(v) => setKind(v)}
          options={[
            { label: "All", value: "all" },
            { label: "Images", value: "image" },
            { label: "PDFs", value: "pdf" },
            { label: "Other", value: "other" },
          ]}
          className="w-fit"
        />
        {groups.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-sm text-paper/55">
            <Paperclip className="h-4 w-4" /> No files match.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(({ day, list }) => (
              <section key={day}>
                <p className="eyebrow mb-2">
                  {day === suggestDate ? "This day · " : ""}
                  {formatDate(day)}
                </p>
                <ul className="space-y-1.5">
                  {list.map((f) => {
                    const already = exclude.has(f.id);
                    const on = chosen.has(f.id);
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          disabled={already}
                          onClick={() => toggle(f.id)}
                          aria-pressed={on}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                            on ? "border-accent/45 bg-accent/[0.07]" : "border-line hover:border-paper/20",
                            already && "cursor-default opacity-55",
                          )}
                        >
                          <FileThumb record={f} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-paper">{f.name}</span>
                            <span className="block truncate text-[0.68rem] text-paper/50">
                              {already ? "Already linked" : fileMeta(f)}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                              on || already ? "border-accent bg-accent text-accent-fg" : "border-paper/25",
                            )}
                          >
                            {(on || already) && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
