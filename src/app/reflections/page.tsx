"use client";

import { useMemo, useState } from "react";
import { Plus, Quote, Heart, Trash2 } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Reflection } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea, Select, RatingPicker } from "@/components/ui/form";
import { formatDate, toISODate, uid, cn } from "@/lib/utils";

const PROMPTS = [
  "What did today teach me about myself?",
  "What am I avoiding, and why?",
  "Where did I feel most alive in my studies today?",
  "What would I tell a friend who had my day?",
  "What is one thing I'm grateful for right now?",
  "What is the fear underneath my procrastination?",
  "If today were my last day of prep, was it worth it?",
];
const MOOD = ["", "Heavy", "Low", "Even", "Light", "Soaring"];

function emptyReflection(): Reflection {
  return {
    id: uid("ref"),
    date: toISODate(new Date()),
    prompt: PROMPTS[0],
    content: "",
    mood: 3,
    gratitude: [],
  };
}

export default function ReflectionsPage() {
  const hydrated = useHasHydrated();
  const reflections = useChronicle((s) => s.reflections);
  const upsert = useChronicle((s) => s.upsertReflection);
  const remove = useChronicle((s) => s.deleteReflection);
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Reflection>(emptyReflection());
  const [gratInput, setGratInput] = useState("");

  const sorted = useMemo(
    () => [...reflections].sort((a, b) => b.date.localeCompare(a.date)),
    [reflections],
  );

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Emotional Reflection Journal"
        title="The inner game."
        description="UPSC is as much an emotional marathon as an intellectual one. This is the private space to process the weight of the journey."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyReflection());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Reflect
          </Button>
        }
      />

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Quote className="h-5 w-5" />}
          title="A quiet page awaits"
          description="Write your first reflection. No one else will read it."
          action={
            <Button
              onClick={() => {
                setDraft(emptyReflection());
                setOpen(true);
              }}
            >
              Begin
            </Button>
          }
        />
      ) : (
        <div className="columns-1 gap-4 md:columns-2 [&>*]:mb-4">
          {sorted.map((r) => (
            <Card key={r.id} className="group break-inside-avoid p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-paper/40">{formatDate(r.date)}</p>
                <button
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete this reflection?",
                        description:
                          "This private entry will be permanently removed.",
                        confirmLabel: "Delete",
                      })
                    )
                      remove(r.id);
                  }}
                  className="text-paper/25 opacity-0 transition-opacity hover:text-paper group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {r.prompt && (
                <p className="mt-2 font-display text-base italic leading-snug text-paper/80">
                  {r.prompt}
                </p>
              )}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-paper/60">
                {r.content}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-paper/[0.06] pt-3">
                <span className="flex items-center gap-1.5 text-[0.7rem] text-paper/40">
                  Mood
                  <span className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          i < r.mood ? "bg-paper" : "bg-paper/15",
                        )}
                      />
                    ))}
                  </span>
                  {MOOD[r.mood]}
                </span>
                {r.gratitude && r.gratitude.length > 0 && (
                  <span className="flex items-center gap-1 text-[0.7rem] text-paper/40">
                    <Heart className="h-3 w-3" /> {r.gratitude.length}
                  </span>
                )}
              </div>
              {r.gratitude && r.gratitude.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.gratitude.map((g, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-paper/[0.05] px-2 py-0.5 text-[0.65rem] text-paper/55"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New reflection"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!draft.content.trim()) return;
                if (
                  !(await confirm({
                    title: "Save this reflection?",
                    description: "It will be added to your reflection journal.",
                    tone: "default",
                    confirmLabel: "Save",
                  }))
                )
                  return;
                const gratitude = gratInput
                  .split(",")
                  .map((g) => g.trim())
                  .filter(Boolean);
                upsert({ ...draft, gratitude });
                setGratInput("");
                setOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Prompt">
            <Select
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            >
              {PROMPTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Your reflection">
            <Textarea
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              placeholder="Let it out…"
              className="min-h-[140px]"
            />
          </Field>
          <Field label="How do you feel?">
            <RatingPicker
              value={draft.mood}
              onChange={(v) => setDraft({ ...draft, mood: v })}
              labels={MOOD.slice(1)}
            />
          </Field>
          <Field label="Grateful for" hint="comma separated">
            <Input
              value={gratInput}
              onChange={(e) => setGratInput(e.target.value)}
              placeholder="Family, good health, a quiet morning"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
