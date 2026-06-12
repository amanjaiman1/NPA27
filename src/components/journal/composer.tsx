"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Sunrise,
  Moon,
  Clock3,
  BookOpen,
  Repeat,
  Target,
  Newspaper,
  Trophy,
  TriangleAlert,
  Lightbulb,
} from "lucide-react";
import type { JournalEntry } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Field,
  Input,
  Textarea,
  Select,
  RatingPicker,
  ListEditor,
} from "@/components/ui/form";
import { AttachmentField } from "./attachments";
import {
  toDraft,
  mergeByKey,
  MOOD_LABELS,
  ENERGY_LABELS,
  MOTIVATION_LABELS,
  FOCUS_LABELS,
} from "./constants";
import { round, formatHours, cn } from "@/lib/utils";

function Section({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-paper/55">
        <Icon className="h-4 w-4" />
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-wider">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

export function JournalComposer({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: JournalEntry;
  onSaved?: (e: JournalEntry) => void;
}) {
  const subjects = useChronicle((s) => s.subjects);
  const upsert = useChronicle((s) => s.upsertJournal);
  const existingDates = useChronicle((s) => s.journal.map((j) => j.date));
  const confirm = useConfirm();
  const [draft, setDraft] = useState<JournalEntry>(() => toDraft(initial));

  useEffect(() => {
    if (open) setDraft(toDraft(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isEdit = existingDates.includes(initial.date);
  const totalDraftHours = round(
    draft.blocks.reduce((a, b) => a + (Number(b.hours) || 0), 0),
    1,
  );

  function patch(p: Partial<JournalEntry>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function save() {
    if (
      !(await confirm({
        title: isEdit ? "Save changes to this entry?" : "Save this journal entry?",
        description: isEdit
          ? "Your edits to this day will be saved."
          : "This entry will be added to your study journal.",
        tone: "default",
        confirmLabel: "Save entry",
      }))
    )
      return;
    const blocks = draft.blocks.filter((b) => b.subjectId && b.hours > 0);
    const totalHours = round(
      blocks.reduce((a, b) => a + Number(b.hours), 0),
      1,
    );
    const entry: JournalEntry = {
      ...draft,
      blocks,
      totalHours,
      wakeTime: draft.wakeTime || undefined,
      sleepTime: draft.sleepTime || undefined,
      highlights: draft.highlights?.trim() || undefined,
      reflection: draft.reflection?.trim() || undefined,
    };
    upsert(entry);
    onSaved?.(entry);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit journal entry" : "New journal entry"}
      description="A complete record of the day — study, state of mind, and memory."
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save entry</Button>
        </>
      }
    >
      <div className="space-y-7">
        {/* Daily rhythm */}
        <Section icon={Clock3} title="Daily rhythm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Date">
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => patch({ date: e.target.value })}
              />
            </Field>
            <Field label="Wake up">
              <div className="relative">
                <Sunrise className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
                <Input
                  type="time"
                  value={draft.wakeTime ?? ""}
                  onChange={(e) => patch({ wakeTime: e.target.value })}
                  className="pl-9"
                />
              </div>
            </Field>
            <Field label="Sleep">
              <div className="relative">
                <Moon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
                <Input
                  type="time"
                  value={draft.sleepTime ?? ""}
                  onChange={(e) => patch({ sleepTime: e.target.value })}
                  className="pl-9"
                />
              </div>
            </Field>
          </div>
        </Section>

        {/* Study blocks */}
        <Section icon={Clock3} title="Study blocks">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[0.7rem] text-paper/35">Subject and hours</span>
            <span className="tabular text-xs text-paper/55">
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
                    patch({ blocks });
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
                    patch({ blocks });
                  }}
                  className="w-20"
                />
                <button
                  type="button"
                  onClick={() =>
                    patch({ blocks: draft.blocks.filter((_, bi) => bi !== i) })
                  }
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-paper/40 hover:bg-paper/[0.06] hover:text-paper"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              patch({ blocks: [...draft.blocks, { subjectId: "", hours: 1 }] })
            }
            className="inline-flex items-center gap-1.5 text-xs font-medium text-paper/60 hover:text-paper"
          >
            <Plus className="h-3.5 w-3.5" /> Add block
          </button>
        </Section>

        {/* What you covered */}
        <Section icon={Target} title="Topics completed">
          <ListEditor
            variant="chips"
            items={draft.topicsCompleted ?? []}
            onChange={(items) => patch({ topicsCompleted: items })}
            placeholder="e.g. Fundamental Rights"
          />
        </Section>

        <div className="grid gap-7 sm:grid-cols-2">
          <Section icon={BookOpen} title="Books studied">
            <ListEditor
              variant="chips"
              items={(draft.booksStudied ?? []).map((b) => b.title)}
              onChange={(items) =>
                patch({
                  booksStudied: mergeByKey(items, draft.booksStudied ?? [], "title"),
                })
              }
              placeholder="Book title"
            />
          </Section>
          <Section icon={Repeat} title="Revision sessions">
            <ListEditor
              variant="chips"
              items={(draft.revisionSessions ?? []).map((r) => r.topic)}
              onChange={(items) =>
                patch({
                  revisionSessions: mergeByKey(
                    items,
                    draft.revisionSessions ?? [],
                    "topic",
                  ),
                })
              }
              placeholder="Topic revised"
            />
          </Section>
          <Section icon={Newspaper} title="Current affairs">
            <ListEditor
              variant="chips"
              items={(draft.currentAffairs ?? []).map((c) => c.title)}
              onChange={(items) =>
                patch({
                  currentAffairs: mergeByKey(
                    items,
                    draft.currentAffairs ?? [],
                    "title",
                  ),
                })
              }
              placeholder="Headline / topic"
            />
          </Section>
          <Section icon={Target} title="Mocks attempted">
            <ListEditor
              variant="chips"
              items={(draft.mocksAttempted ?? []).map((m) => m.name)}
              onChange={(items) =>
                patch({
                  mocksAttempted: mergeByKey(
                    items,
                    draft.mocksAttempted ?? [],
                    "name",
                  ),
                })
              }
              placeholder="Mock name"
            />
          </Section>
        </div>

        {/* State of mind */}
        <Section icon={Sunrise} title="State of mind">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Mood">
              <RatingPicker
                value={draft.mood}
                onChange={(v) => patch({ mood: v })}
                labels={MOOD_LABELS.slice(1)}
              />
            </Field>
            <Field label="Energy">
              <RatingPicker
                value={draft.energy}
                onChange={(v) => patch({ energy: v })}
                labels={ENERGY_LABELS.slice(1)}
              />
            </Field>
            <Field label="Motivation">
              <RatingPicker
                value={draft.motivation}
                onChange={(v) => patch({ motivation: v })}
                labels={MOTIVATION_LABELS.slice(1)}
              />
            </Field>
            <Field label="Focus">
              <RatingPicker
                value={draft.focus}
                onChange={(v) => patch({ focus: v })}
                labels={FOCUS_LABELS.slice(1)}
              />
            </Field>
          </div>
        </Section>

        {/* Narrative */}
        <Section icon={Trophy} title="Wins of the day">
          <ListEditor
            items={draft.wins ?? []}
            onChange={(items) => patch({ wins: items })}
            placeholder="What went well today?"
          />
        </Section>
        <Section icon={TriangleAlert} title="Failures of the day">
          <ListEditor
            items={draft.failures ?? []}
            onChange={(items) => patch({ failures: items })}
            placeholder="What slipped?"
          />
        </Section>
        <Section icon={Lightbulb} title="Lessons learned">
          <ListEditor
            items={draft.lessons ?? []}
            onChange={(items) => patch({ lessons: items })}
            placeholder="What will you carry into tomorrow?"
          />
        </Section>

        <Field label="Highlight of the day">
          <Input
            value={draft.highlights ?? ""}
            onChange={(e) => patch({ highlights: e.target.value })}
            placeholder="One line that captures the day"
          />
        </Field>
        <Field label="Personal reflection">
          <Textarea
            value={draft.reflection ?? ""}
            onChange={(e) => patch({ reflection: e.target.value })}
            placeholder="How did today really go?"
            className="min-h-[120px]"
          />
        </Field>
        <Field label="Tags">
          <ListEditor
            variant="chips"
            items={draft.tags ?? []}
            onChange={(items) => patch({ tags: items })}
            placeholder="deep-work, revision…"
          />
        </Field>

        {/* Memory */}
        <Section icon={BookOpen} title="Photos & attachments">
          <AttachmentField
            attachments={draft.attachments ?? []}
            onChange={(a) => patch({ attachments: a })}
          />
        </Section>
      </div>
    </Modal>
  );
}
