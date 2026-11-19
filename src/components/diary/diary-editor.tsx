"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bold,
  Download,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Lock,
  Maximize2,
  Minimize2,
  Pin,
  Quote,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useChronicle } from "@/lib/store";
import type { ISODate, Reflection } from "@/lib/types";
import {
  DIARY_CATEGORIES,
  MOOD_WORDS,
  PROMPT_GROUPS,
  applyFormat,
  charCount,
  cleanTag,
  entryMarkdown,
  entryTitle,
  wordCount,
  type FormatAction,
} from "@/lib/diary";
import { removeStoredPaths } from "@/lib/file-storage";
import { AttachmentTray, type SessionFile } from "@/components/attachments/attachment-tray";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Disclosure, Segmented } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, toISODate } from "@/lib/utils";
import { DiaryText } from "./diary-text";

/* ════════════════════════════════════════════════════════════════
   WRITING AN ENTRY
   A quiet page: a title, the words, a few formatting buttons. It saves
   by itself a moment after you stop typing (and when you leave), so
   there's no Save button to forget. A new entry is kept only once it has
   something in it.
   ════════════════════════════════════════════════════════════════ */

const AUTOSAVE_MS = 1200;

const TOOLS: { action: FormatAction; label: string; keys?: string; icon: React.ElementType }[] = [
  { action: "bold", label: "Bold", keys: "Ctrl+B", icon: Bold },
  { action: "italic", label: "Italic", keys: "Ctrl+I", icon: Italic },
  { action: "heading", label: "Heading", icon: Heading2 },
  { action: "bullet", label: "Bulleted list", icon: List },
  { action: "number", label: "Numbered list", icon: ListOrdered },
  { action: "quote", label: "Quote", icon: Quote },
];

/** The fields that make an entry different from the one saved. */
function signature(r: Reflection): string {
  return JSON.stringify([r.date, r.title ?? "", r.content, r.prompt ?? "", r.category ?? "", r.tags ?? [], Boolean(r.pinned), Boolean(r.important), r.fileIds ?? []]);
}

function hasContent(r: Reflection): boolean {
  return Boolean(r.content.trim() || r.title?.trim() || r.fileIds?.length);
}

/** Only the fields worth keeping: empty ones are left off. */
function tidy(r: Reflection): Reflection {
  const out: Reflection = { ...r, content: r.content, title: r.title?.trim() || undefined, prompt: r.prompt || undefined, category: r.category || undefined };
  if (!out.tags?.length) delete out.tags;
  if (!out.pinned) delete out.pinned;
  if (!out.important) delete out.important;
  for (const k of ["title", "prompt", "category"] as const) if (out[k] === undefined) delete out[k];
  return out;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DiaryEditor({
  entry,
  isNew,
  focus,
  onFocusChange,
  onSaved,
  onClose,
}: {
  entry: Reflection;
  /** Not in the diary yet: kept once it has something in it. */
  isNew: boolean;
  focus: boolean;
  onFocusChange: (on: boolean) => void;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const save = useChronicle((s) => s.saveDiaryEntry);
  const deleteEntry = useChronicle((s) => s.deleteReflection);
  const files = useChronicle((s) => s.files);
  const confirm = useConfirm();
  const toast = useToast();
  const today = toISODate(new Date());
  const ids = useId();

  const [draft, setDraft] = useState<Reflection>(entry);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "waiting" | "saved">(isNew ? "idle" : "saved");
  const [savedAt, setSavedAt] = useState<string | null>(entry.updatedAt ?? null);
  const [tagText, setTagText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  // Live copies for the timers and the unmount flush.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const sessionRef = useRef(sessionFiles);
  sessionRef.current = sessionFiles;
  const lastSaved = useRef(isNew ? signature({ ...entry, content: "" }) : signature(entry));
  const savedOnce = useRef(!isNew);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const flush = useCallback(() => {
    const d = draftRef.current;
    if (!hasContent(d)) return false;
    if (signature(d) === lastSaved.current && !sessionRef.current.length) return false;
    const saved = save({ entry: tidy(d), newFiles: sessionRef.current.map((s) => s.record) });
    lastSaved.current = signature({ ...d, fileIds: saved.fileIds });
    sessionRef.current = [];
    setSessionFiles([]);
    if ((saved.fileIds ?? []).join() !== (d.fileIds ?? []).join()) setDraft((x) => ({ ...x, fileIds: saved.fileIds }));
    setSavedAt(saved.updatedAt ?? new Date().toISOString());
    setStatus("saved");
    if (!savedOnce.current) {
      savedOnce.current = true;
      onSavedRef.current(saved.id);
    }
    return true;
  }, [save]);

  // Saves a moment after the last change.
  useEffect(() => {
    if (uploading || !hasContent(draft)) return;
    if (signature(draft) === lastSaved.current && !sessionFiles.length) return;
    setStatus("waiting");
    const t = window.setTimeout(flush, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [draft, sessionFiles, uploading, flush]);

  // And when you leave: another entry, another page, or the tab.
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const set = <K extends keyof Reflection>(key: K, value: Reflection[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function format(action: FormatAction) {
    const el = area.current;
    if (!el) return;
    const next = applyFormat(draft.content, el.selectionStart, el.selectionEnd, action);
    set("content", next.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  }

  function addTag(raw: string) {
    const t = cleanTag(raw);
    if (!t) return;
    const tags = draft.tags ?? [];
    if (!tags.includes(t) && tags.length < 12) set("tags", [...tags, t]);
    setTagText("");
  }

  async function remove() {
    if (!savedOnce.current) {
      // Never kept: let go of anything uploaded for it.
      const stored = new Set(useChronicle.getState().files.map((f) => f.path));
      const paths = sessionRef.current.filter((s) => s.created && !stored.has(s.record.path)).map((s) => s.record.path);
      if (paths.length) void removeStoredPaths(paths);
      lastSaved.current = signature(draftRef.current);
      sessionRef.current = [];
      onClose();
      return;
    }
    const ok = await confirm({
      title: `Delete “${entryTitle(draft)}”?`,
      description: draft.fileIds?.length
        ? "The entry and its attachments are deleted, unless a file is also attached somewhere else."
        : "The entry is deleted from this account on every device.",
      confirmLabel: "Delete entry",
    });
    if (!ok) return;
    // Nothing more to save for it.
    lastSaved.current = signature(draftRef.current);
    sessionRef.current = [];
    deleteEntry(draft.id);
    toast({ title: "Entry deleted" });
    onClose();
  }

  function exportEntry() {
    flush();
    const names = new Map(files.map((f) => [f.id, f.name]));
    download(`diary-${draft.date}-${draft.id.slice(-6)}.md`, entryMarkdown(tidy(draftRef.current), names));
    toast({ title: "Entry exported", description: "Saved as a Markdown file on this device." });
  }

  const words = wordCount(draft.content);
  const chars = charCount(draft.content);
  const statusText =
    status === "waiting"
      ? "Saving…"
      : status === "saved" && savedAt
        ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : hasContent(draft)
          ? "Not saved yet"
          : "Starts saving once you write";
  const older = Boolean((draft.mood && draft.mood > 0) || draft.gratitude?.length);

  const otherDates = useMemo<ISODate[]>(() => [], []);

  return (
    <article aria-label={isNew ? "New diary entry" : `Diary entry: ${entryTitle(draft)}`} className="flex min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        <Button size="sm" variant="subtle" onClick={() => { flush(); onClose(); }} className="lg:hidden" aria-label="Back to entries">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Entries
        </Button>
        <label className="sr-only" htmlFor={`${ids}-date`}>
          Date of the entry
        </label>
        <Input
          id={`${ids}-date`}
          type="date"
          value={draft.date}
          max={today}
          onChange={(e) => e.target.value && e.target.value <= today && set("date", e.target.value)}
          className="h-9 w-auto py-1.5 text-[0.8rem]"
        />
        <label className="sr-only" htmlFor={`${ids}-cat`}>
          Category
        </label>
        <Select id={`${ids}-cat`} value={draft.category ?? ""} onChange={(e) => set("category", e.target.value || undefined)} className="h-9 w-auto py-1.5 text-[0.8rem]">
          <option value="">No category</option>
          {DIARY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {draft.category && !(DIARY_CATEGORIES as readonly string[]).includes(draft.category) && <option value={draft.category}>{draft.category}</option>}
        </Select>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label={draft.pinned ? "Unpin" : "Pin to the top"} active={Boolean(draft.pinned)} size="sm" onClick={() => set("pinned", !draft.pinned)} aria-pressed={Boolean(draft.pinned)}>
            <Pin className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
          <IconButton
            label={draft.important ? "Not important" : "Mark as important"}
            active={Boolean(draft.important)}
            size="sm"
            onClick={() => set("important", !draft.important)}
            aria-pressed={Boolean(draft.important)}
          >
            <Star className={cn("h-3.5 w-3.5", draft.important && "fill-current")} aria-hidden />
          </IconButton>
          <IconButton label={focus ? "Leave focus mode" : "Focus mode"} hint={focus ? undefined : "Hide everything but the page."} size="sm" onClick={() => onFocusChange(!focus)} className="hidden lg:grid">
            {focus ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
          </IconButton>
          <IconButton label="Export this entry" hint="As a Markdown file." size="sm" onClick={exportEntry} disabled={!hasContent(draft)}>
            <Download className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
          <IconButton label={savedOnce.current ? "Delete this entry" : "Discard this entry"} size="sm" onClick={() => void remove()}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
        </div>
      </div>

      {/* The page */}
      <div className="mx-auto w-full max-w-[44rem] flex-1 space-y-4 pt-5">
        {draft.prompt && (
          <div className="flex items-start gap-2 rounded-xl bg-accent/[0.07] px-3.5 py-2.5">
            <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            <p className="min-w-0 flex-1 text-[0.86rem] italic text-paper/80">{draft.prompt}</p>
            <button type="button" onClick={() => set("prompt", undefined)} aria-label="Remove the prompt" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-paper/50 hover:text-paper">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}

        <label className="sr-only" htmlFor={`${ids}-title`}>
          Title
        </label>
        <input
          id={`${ids}-title`}
          value={draft.title ?? ""}
          onChange={(e) => set("title", e.target.value)}
          maxLength={120}
          placeholder="Title (optional)"
          autoComplete="off"
          data-autofocus={isNew ? "" : undefined}
          className="w-full bg-transparent text-[1.45rem] font-semibold tracking-[-0.02em] text-paper placeholder:text-paper/30 focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
            {TOOLS.map((t) => (
              <Tooltip key={t.action} content={t.keys ? `${t.label} (${t.keys})` : t.label} describe={false}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => format(t.action)}
                  disabled={mode === "preview"}
                  aria-label={t.label}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-transparent text-paper/60 transition-colors hover:bg-paper/[0.06] hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:opacity-30"
                >
                  <t.icon className="h-4 w-4" aria-hidden />
                </button>
              </Tooltip>
            ))}
          </div>
          <Segmented<"write" | "preview">
            label="Write or preview"
            compact
            value={mode}
            onChange={setMode}
            options={[
              { value: "write", label: "Write" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </div>

        {mode === "write" ? (
          <>
            <label className="sr-only" htmlFor={`${ids}-body`}>
              Entry
            </label>
            <textarea
              id={`${ids}-body`}
              ref={area}
              value={draft.content}
              onChange={(e) => set("content", e.target.value)}
              onKeyDown={(e) => {
                if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
                const k = e.key.toLowerCase();
                if (k === "b" || k === "i") {
                  e.preventDefault();
                  format(k === "b" ? "bold" : "italic");
                }
              }}
              placeholder="Write whatever is on your mind. Only you can read this."
              className={cn(
                "field w-full resize-none rounded-2xl border border-transparent bg-transparent px-1 py-1 text-[0.98rem] leading-[1.8] text-paper placeholder:text-paper/35",
                "focus:outline-none",
                focus ? "min-h-[60vh]" : "min-h-[22rem]",
              )}
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
          </>
        ) : (
          <div className={cn("rounded-2xl px-1 py-1", focus ? "min-h-[60vh]" : "min-h-[22rem]")}>
            <DiaryText text={draft.content} />
          </div>
        )}

        <p className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-paper/50" aria-live="polite">
          <span className="tabular">
            {words} {words === 1 ? "word" : "words"} · {chars} {chars === 1 ? "character" : "characters"}
          </span>
          <span className={cn("inline-flex items-center gap-1.5", status === "saved" && "text-positive")}>
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", status === "waiting" ? "animate-pulse bg-warning" : status === "saved" ? "bg-positive" : "bg-paper/30")} />
            {statusText}
          </span>
        </p>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-paper/45" aria-hidden />
          {(draft.tags ?? []).map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-paper/[0.06] py-0.5 pl-2.5 pr-1 text-[0.72rem] font-medium text-paper/75">
              #{t}
              <button type="button" onClick={() => set("tags", (draft.tags ?? []).filter((x) => x !== t))} aria-label={`Remove the tag ${t}`} className="grid h-4 w-4 place-items-center rounded-full text-paper/45 hover:text-paper">
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
          <label className="sr-only" htmlFor={`${ids}-tag`}>
            Add a tag
          </label>
          <input
            id={`${ids}-tag`}
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagText);
              } else if (e.key === "Backspace" && !tagText && draft.tags?.length) {
                set("tags", draft.tags.slice(0, -1));
              }
            }}
            onBlur={() => tagText && addTag(tagText)}
            placeholder={draft.tags?.length ? "Add another" : "Add tags, e.g. exam stress"}
            className="min-w-[9rem] flex-1 bg-transparent py-1 text-[0.76rem] text-paper placeholder:text-paper/35 focus:outline-none"
          />
        </div>

        {older && (
          <div className="rounded-xl border border-line px-3.5 py-2.5 text-[0.76rem] text-paper/70">
            <p className="mb-1 font-semibold text-paper/60">From the reflection journal</p>
            {draft.mood ? <p>Mood that day: {MOOD_WORDS[draft.mood] ?? draft.mood}</p> : null}
            {draft.gratitude?.length ? <p>Grateful for: {draft.gratitude.join(", ")}</p> : null}
          </div>
        )}

        {!focus && (
          <>
            <Disclosure summary={<span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden /> Need a prompt?</span>}>
              <div className="space-y-3 pb-2">
                {PROMPT_GROUPS.map((g) => (
                  <div key={g.group}>
                    <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-paper/45">{g.group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.prompts.map((p) => (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={draft.prompt === p}
                          onClick={() => set("prompt", draft.prompt === p ? undefined : p)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-left text-[0.74rem] transition-colors",
                            draft.prompt === p ? "border-accent/45 bg-accent/10 text-accent" : "border-line text-paper/70 hover:border-paper/25 hover:text-paper",
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Disclosure>

            <Disclosure summary={`Attachments${draft.fileIds?.length ? ` (${draft.fileIds.length})` : ""}`} defaultOpen={Boolean(draft.fileIds?.length)}>
              <div className="pb-2">
                <AttachmentTray
                  entryDate={draft.date}
                  otherDates={otherDates}
                  fileIds={draft.fileIds ?? []}
                  onChange={(next) => set("fileIds", next)}
                  sessionFiles={sessionFiles}
                  onSessionFile={(f) => setSessionFiles((list) => [...list, f])}
                  onReplace={() => undefined}
                  onBusyChange={setUploading}
                />
              </div>
            </Disclosure>
          </>
        )}

        <p className="flex items-center gap-1.5 pb-2 text-[0.7rem] text-paper/45">
          <Lock className="h-3 w-3" aria-hidden /> Private to you. Not read by reviews, the coach, habits or reminders.
          {!isNew && draft.createdAt && <span className="ml-auto">Written {formatDate(draft.createdAt.slice(0, 10))}</span>}
        </p>
      </div>
    </article>
  );
}
