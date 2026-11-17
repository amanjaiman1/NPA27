"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Bookmark,
  Newspaper,
  Pencil,
  Trash2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { CurrentAffair, CACategory } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { relativeDay, toISODate, uid, cn, formatDate } from "@/lib/utils";

const CATEGORIES: CACategory[] = [
  "Polity",
  "Economy",
  "Environment",
  "International",
  "Science & Tech",
  "Society",
  "Schemes",
  "Reports & Indices",
  "Geography",
  "Misc",
];

function emptyCA(): CurrentAffair {
  return {
    id: uid("ca"),
    date: toISODate(new Date()),
    title: "",
    source: "",
    category: "Polity",
    tags: [],
    summary: "",
    prelimsRelevant: true,
    mainsRelevant: true,
    bookmarked: false,
  };
}

export default function CurrentAffairsPage() {
  const hydrated = useHasHydrated();
  const items = useChronicle((s) => s.currentAffairs);
  const toggleBookmark = useChronicle((s) => s.toggleBookmark);
  const upsert = useChronicle((s) => s.upsertCurrentAffair);
  const remove = useChronicle((s) => s.deleteCurrentAffair);
  const confirm = useConfirm();

  const [cat, setCat] = useState<CACategory | "all" | "saved">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CurrentAffair>(emptyCA());
  const [tagInput, setTagInput] = useState("");
  /** The note being read in full. A card's summary is only a preview. */
  const [reading, setReading] = useState<CurrentAffair | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...items]
      .filter((i) => {
        if (cat === "saved") return i.bookmarked;
        if (cat !== "all") return i.category === cat;
        return true;
      })
      .filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          i.summary.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [items, cat, query]);

  const today = toISODate(new Date());
  const savedCount = items.filter((i) => i.bookmarked).length;
  // Read from the store, not from the click, so the reader reflects an edit or a
  // bookmark made while it's open.
  const openNote = reading ? items.find((i) => i.id === reading.id) ?? null : null;
  const isEditing = items.some((i) => i.id === draft.id);

  function startEdit(note: CurrentAffair) {
    setDraft({ ...note });
    setTagInput(note.tags.join(", "));
    setReading(null);
    setOpen(true);
  }

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Current Affairs Vault"
        title="The news, distilled and never lost."
        description="A searchable archive of everything that matters — tagged, categorised, and linked to the syllabus."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyCA());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add note
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the vault…"
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={cat === "all"} onClick={() => setCat("all")}>
            All
          </Chip>
          <Chip active={cat === "saved"} onClick={() => setCat("saved")}>
            Saved · {savedCount}
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-5 w-5" />}
          title="Nothing here yet"
          description="Add a current affairs note or adjust your filters."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((i) => (
            <Card key={i.id} hover className="relative flex flex-col p-5">
              {/* Stretched over the whole card so the note opens on click and on
                  Enter, without nesting a button inside a button. */}
              <button
                onClick={() => setReading(i)}
                aria-label={`Open “${i.title}”`}
                className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
              />
              <div className="relative z-10 mb-2 flex items-start justify-between gap-3">
                <Badge tone="default">{i.category}</Badge>
                <button
                  onClick={() => toggleBookmark(i.id)}
                  aria-label={i.bookmarked ? "Remove bookmark" : "Bookmark this"}
                  aria-pressed={i.bookmarked}
                  title={i.bookmarked ? "Remove bookmark" : "Bookmark this"}
                  className={cn(
                    "shrink-0 transition-colors",
                    i.bookmarked ? "text-paper" : "text-paper/30 hover:text-paper/60",
                  )}
                >
                  <Bookmark
                    className={cn("h-4 w-4", i.bookmarked && "fill-paper")}
                  />
                </button>
              </div>
              <h3 className="pointer-events-none relative z-10 text-[0.95rem] font-semibold leading-snug text-paper">
                {i.title}
              </h3>
              <p className="pointer-events-none relative z-10 mt-2 line-clamp-3 flex-1 whitespace-pre-line text-sm leading-relaxed text-paper/55">
                {i.summary}
              </p>
              {i.summary.length > 180 && (
                <span className="pointer-events-none relative z-10 mt-2 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-accent">
                  Read the full note
                  <ArrowRight className="h-3 w-3" />
                </span>
              )}
              <div className="pointer-events-none relative z-10 mt-3 flex flex-wrap gap-1.5">
                {i.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-paper/[0.05] px-1.5 py-0.5 text-[0.65rem] text-paper/50"
                  >
                    #{t}
                  </span>
                ))}
              </div>
              <div className="pointer-events-none relative z-10 mt-3 flex items-center justify-between border-t border-paper/[0.06] pt-3 text-[0.7rem] text-paper/40">
                <span>
                  {i.source} · {relativeDay(i.date, today)}
                </span>
                <span className="flex gap-1.5">
                  {i.prelimsRelevant && <Badge tone="ghost">P</Badge>}
                  {i.mainsRelevant && <Badge tone="ghost">M</Badge>}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}


      {/* ── The reader ───────────────────────────────────────────────────────
          A card shows three lines; a saved note can be pages long. This is
          where the whole thing is readable, with the line breaks it was typed
          with, every tag, and the ways to change it. */}
      <Modal
        open={Boolean(openNote)}
        onClose={() => setReading(null)}
        title={openNote?.title}
        className="sm:max-w-2xl"
        footer={
          openNote ? (
            <>
              <Button
                variant="danger"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Delete this note?",
                      description: `“${openNote.title}” will be permanently removed from the vault.`,
                      confirmLabel: "Delete note",
                    })
                  ) {
                    remove(openNote.id);
                    setReading(null);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => startEdit(openNote)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button onClick={() => setReading(null)}>Done</Button>
            </>
          ) : null
        }
      >
        {openNote && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="default">{openNote.category}</Badge>
              {openNote.prelimsRelevant && <Badge tone="accent">Prelims</Badge>}
              {openNote.mainsRelevant && <Badge tone="accent">Mains</Badge>}
              <button
                onClick={() => toggleBookmark(openNote.id)}
                aria-pressed={openNote.bookmarked}
                className={cn(
                  "ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.7rem] font-semibold transition-colors",
                  openNote.bookmarked
                    ? "border-accent/35 bg-accent/15 text-accent"
                    : "border-line text-paper/55 hover:border-paper/25 hover:text-paper",
                )}
              >
                <Bookmark
                  className={cn("h-3.5 w-3.5", openNote.bookmarked && "fill-current")}
                />
                {openNote.bookmarked ? "Saved" : "Save"}
              </button>
            </div>

            <p className="text-[0.7rem] text-paper/45">
              {formatDate(openNote.date)} · {relativeDay(openNote.date, today)}
              {openNote.source ? " · " : ""}
              {openNote.source &&
                (/^https?:\/\//.test(openNote.source) ? (
                  <a
                    href={openNote.source}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    Source
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  openNote.source
                ))}
            </p>

            {/* `whitespace-pre-wrap` keeps the paragraphs as they were typed —
                the card preview collapses them, which is part of why a long
                note looked like a stub. */}
            <div className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-paper/80">
              {openNote.summary || (
                <span className="text-paper/40">No summary was written for this one.</span>
              )}
            </div>

            {openNote.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-line pt-4">
                {openNote.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-paper/[0.05] px-2 py-0.5 text-[0.7rem] text-paper/60"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isEditing ? "Edit this note" : "Add to the vault"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!draft.title.trim()) return;
                if (
                  !(await confirm({
                    title: isEditing
                      ? "Save changes to this note?"
                      : "Add this note to the vault?",
                    description: isEditing
                      ? "Your edits to this note will be saved."
                      : "It will be saved to your current affairs archive.",
                    tone: "default",
                    confirmLabel: isEditing ? "Save changes" : "Add note",
                  }))
                )
                  return;
                const tags = tagInput
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean);
                upsert({ ...draft, tags });
                setTagInput("");
                setOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Headline">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="What happened?"
            />
          </Field>
          <Field label="Summary">
            <Textarea
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              placeholder="Why it matters for the exam…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <Select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as CACategory })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Source">
              <Input
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                placeholder="e.g. The Hindu"
              />
            </Field>
          </div>
          <Field label="Tags" hint="comma separated">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="RBI, Monetary Policy"
            />
          </Field>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-paper/70">
              <input
                type="checkbox"
                checked={draft.prelimsRelevant}
                onChange={(e) =>
                  setDraft({ ...draft, prelimsRelevant: e.target.checked })
                }
                className="h-4 w-4 accent-paper"
              />
              Prelims
            </label>
            <label className="flex items-center gap-2 text-sm text-paper/70">
              <input
                type="checkbox"
                checked={draft.mainsRelevant}
                onChange={(e) =>
                  setDraft({ ...draft, mainsRelevant: e.target.checked })
                }
                className="h-4 w-4 accent-paper"
              />
              Mains
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
