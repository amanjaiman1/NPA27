"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Pencil, NotebookPen, Search } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { JournalEntry, StudyBlock } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea, Select, RatingPicker } from "@/components/ui/form";
import {
  toISODate,
  weekday,
  formatHours,
  relativeDay,
  round,
  uid,
} from "@/lib/utils";

const MOOD = ["", "Drained", "Low", "Steady", "Good", "In flow"];

function emptyEntry(): JournalEntry {
  return {
    id: uid("j"),
    date: toISODate(new Date()),
    blocks: [{ subjectId: "", hours: 2 }],
    totalHours: 0,
    mood: 3,
    energy: 3,
    focus: 3,
    highlights: "",
    reflection: "",
  };
}

export default function JournalPage() {
  const hydrated = useHasHydrated();
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const upsertJournal = useChronicle((s) => s.upsertJournal);
  const deleteJournal = useChronicle((s) => s.deleteJournal);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<JournalEntry>(emptyEntry());
  const [query, setQuery] = useState("");

  // open composer when navigated with ?new=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      const today = toISODate(new Date());
      const existing = journal.find((j) => j.date === today);
      setDraft(existing ? { ...existing } : emptyEntry());
      setOpen(true);
      window.history.replaceState({}, "", "/journal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? "Unassigned";

  const sorted = useMemo(
    () => [...journal].sort((a, b) => b.date.localeCompare(a.date)),
    [journal],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.reflection?.toLowerCase().includes(q) ||
        e.highlights?.toLowerCase().includes(q) ||
        e.blocks.some((b) => subjectName(b.subjectId).toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sorted]);

  function startNew() {
    setDraft(emptyEntry());
    setOpen(true);
  }
  function startEdit(e: JournalEntry) {
    setDraft({ ...e, blocks: e.blocks.map((b) => ({ ...b })) });
    setOpen(true);
  }

  function save() {
    const blocks = draft.blocks.filter((b) => b.subjectId && b.hours > 0);
    const totalHours = round(blocks.reduce((a, b) => a + Number(b.hours), 0), 1);
    upsertJournal({ ...draft, blocks, totalHours });
    setOpen(false);
  }

  const totalDraftHours = round(
    draft.blocks.reduce((a, b) => a + (Number(b.hours) || 0), 0),
    1,
  );

  if (!hydrated) return <Loading />;

  const today = toISODate(new Date());

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Daily Study Journal"
        title="Every day, written down."
        description="The atomic unit of the Chronicle. Each entry becomes a permanent part of your searchable timeline."
        actions={
          <Button onClick={startNew}>
            <Plus className="h-4 w-4" /> New entry
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reflections, subjects…"
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<NotebookPen className="h-5 w-5" />}
          title="No entries yet"
          description="Log your first study session to begin the Chronicle."
          action={<Button onClick={startNew}>Write today’s entry</Button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.35 }}
            >
              <Card hover className="group p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {/* date column */}
                  <div className="flex w-full shrink-0 items-center justify-between sm:w-24 sm:flex-col sm:items-start">
                    <div>
                      <p className="tabular text-2xl font-semibold leading-none text-paper">
                        {new Date(e.date).getDate()}
                      </p>
                      <p className="mt-1 text-xs text-paper/40">
                        {weekday(e.date)} ·{" "}
                        {new Date(e.date).toLocaleDateString("en-US", {
                          month: "short",
                        })}
                      </p>
                    </div>
                    <span className="text-[0.7rem] text-paper/30 sm:mt-1">
                      {e.date === today ? "Today" : relativeDay(e.date, today)}
                    </span>
                  </div>

                  {/* content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink">
                        {formatHours(e.totalHours)}
                      </span>
                      {e.blocks.map((b, bi) => (
                        <Badge key={bi} tone="outline">
                          {subjectName(b.subjectId)} · {formatHours(b.hours)}
                        </Badge>
                      ))}
                    </div>
                    {e.highlights && (
                      <p className="mt-3 text-sm font-medium text-paper/80">
                        {e.highlights}
                      </p>
                    )}
                    {e.reflection && (
                      <p className="mt-1.5 text-sm leading-relaxed text-paper/50">
                        {e.reflection}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-[0.7rem] text-paper/40">
                      <span>Mood · {MOOD[e.mood]}</span>
                      <span>Energy · {e.energy}/5</span>
                      <span>Focus · {e.focus}/5</span>
                    </div>
                  </div>

                  {/* actions */}
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => startEdit(e)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-paper/40 hover:bg-paper/[0.06] hover:text-paper"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteJournal(e.id)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-paper/40 hover:bg-paper/[0.06] hover:text-paper"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Composer */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id && journal.some((j) => j.id === draft.id) ? "Edit entry" : "New journal entry"}
        description="Capture what you studied and how the day felt."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save entry</Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Date">
            <Input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[0.7rem] font-medium uppercase tracking-wider text-paper/45">
                Study blocks
              </span>
              <span className="tabular text-xs text-paper/50">
                {formatHours(totalDraftHours)} total
              </span>
            </div>
            <div className="space-y-2">
              {draft.blocks.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={b.subjectId}
                    onChange={(e) => {
                      const blocks = [...draft.blocks];
                      blocks[i] = { ...blocks[i], subjectId: e.target.value };
                      setDraft({ ...draft, blocks });
                    }}
                    className="flex-1"
                  >
                    <option value="">Select subject…</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={b.hours}
                    onChange={(e) => {
                      const blocks = [...draft.blocks];
                      blocks[i] = {
                        ...blocks[i],
                        hours: parseFloat(e.target.value) || 0,
                      };
                      setDraft({ ...draft, blocks });
                    }}
                    className="w-20"
                  />
                  <button
                    onClick={() =>
                      setDraft({
                        ...draft,
                        blocks: draft.blocks.filter((_, bi) => bi !== i),
                      })
                    }
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-paper/40 hover:bg-paper/[0.06] hover:text-paper"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  blocks: [...draft.blocks, { subjectId: "", hours: 1 } as StudyBlock],
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-paper/60 hover:text-paper"
            >
              <Plus className="h-3.5 w-3.5" /> Add block
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Mood">
              <RatingPicker
                value={draft.mood}
                onChange={(v) => setDraft({ ...draft, mood: v })}
                labels={MOOD.slice(1)}
              />
            </Field>
            <Field label="Energy">
              <RatingPicker
                value={draft.energy}
                onChange={(v) => setDraft({ ...draft, energy: v })}
              />
            </Field>
            <Field label="Focus">
              <RatingPicker
                value={draft.focus}
                onChange={(v) => setDraft({ ...draft, focus: v })}
              />
            </Field>
          </div>

          <Field label="Highlight of the day">
            <Input
              value={draft.highlights ?? ""}
              onChange={(e) => setDraft({ ...draft, highlights: e.target.value })}
              placeholder="e.g. Finished Polity Ch. 12"
            />
          </Field>

          <Field label="Reflection">
            <Textarea
              value={draft.reflection ?? ""}
              onChange={(e) => setDraft({ ...draft, reflection: e.target.value })}
              placeholder="How did today really go?"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
