"use client";

import { useMemo, useState } from "react";
import { Plus, TriangleAlert, Trash2, ArrowRight } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Mistake, MistakeType, MistakeStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { formatDate, toISODate, uid, cn } from "@/lib/utils";

const TYPES: MistakeType[] = [
  "Conceptual",
  "Silly",
  "Factual",
  "Time Management",
  "Misreading",
];
const STATUSES: MistakeStatus[] = ["Open", "Reviewing", "Resolved"];

function emptyMistake(subjectId: string): Mistake {
  return {
    id: uid("mis"),
    date: toISODate(new Date()),
    subjectId,
    topic: "",
    type: "Conceptual",
    description: "",
    correction: "",
    status: "Open",
  };
}

export default function MistakesPage() {
  const hydrated = useHasHydrated();
  const mistakes = useChronicle((s) => s.mistakes);
  const subjects = useChronicle((s) => s.subjects);
  const upsert = useChronicle((s) => s.upsertMistake);
  const setStatus = useChronicle((s) => s.setMistakeStatus);
  const remove = useChronicle((s) => s.deleteMistake);

  const [filter, setFilter] = useState<MistakeStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Mistake>(emptyMistake(""));

  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? id;

  const filtered = useMemo(
    () =>
      [...mistakes]
        .filter((m) => filter === "all" || m.status === filter)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [mistakes, filter],
  );

  const stats = useMemo(() => {
    const open = mistakes.filter((m) => m.status !== "Resolved").length;
    const resolved = mistakes.filter((m) => m.status === "Resolved").length;
    const byType = TYPES.map((t) => ({
      type: t,
      count: mistakes.filter((m) => m.type === t).length,
    })).sort((a, b) => b.count - a.count);
    return { open, resolved, top: byType[0] };
  }, [mistakes]);

  function nextStatus(s: MistakeStatus): MistakeStatus {
    return STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];
  }

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mistake Tracker"
        title="Every error is a lesson in disguise."
        description="The toppers aren't the ones who never err — they're the ones who never repeat the same mistake. Log it, correct it, close it."
        actions={
          <Button
            onClick={() => {
              setDraft(emptyMistake(subjects[0]?.id ?? ""));
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Log mistake
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">Open</p>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">{stats.open}</p>
        </Card>
        <Card className="p-5">
          <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">
            Resolved
          </p>
          <p className="tabular mt-2 text-2xl font-semibold text-paper">
            {stats.resolved}
          </p>
        </Card>
        <Card className="col-span-2 p-5 sm:col-span-1">
          <p className="text-[0.7rem] uppercase tracking-wider text-paper/40">
            Most common
          </p>
          <p className="mt-2 text-lg font-semibold text-paper">
            {stats.top?.type ?? "—"}
          </p>
          <p className="text-xs text-paper/40">{stats.top?.count ?? 0} logged</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {s}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<TriangleAlert className="h-5 w-5" />}
          title="No mistakes here"
          description="Either you're flawless, or it's time to start logging. (It's the latter.)"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <Card key={m.id} className="group p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="default">{m.type}</Badge>
                <span className="text-xs text-paper/50">{name(m.subjectId)}</span>
                <span className="text-xs text-paper/30">· {m.topic}</span>
                <span className="ml-auto text-[0.7rem] text-paper/30">
                  {formatDate(m.date)}
                </span>
              </div>
              <p className="mt-3 text-sm text-paper/80">{m.description}</p>
              {m.correction && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-paper/[0.08] bg-paper/[0.03] p-3">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper/40" />
                  <p className="text-sm leading-relaxed text-paper/60">
                    {m.correction}
                  </p>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => setStatus(m.id, nextStatus(m.status))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    m.status === "Resolved"
                      ? "border-paper/30 bg-paper text-ink"
                      : m.status === "Reviewing"
                        ? "border-paper/25 bg-paper/10 text-paper"
                        : "border-paper/12 text-paper/55 hover:border-paper/25",
                  )}
                >
                  {m.status} ›
                </button>
                <button
                  onClick={() => remove(m.id)}
                  className="text-paper/25 opacity-0 transition-opacity hover:text-paper group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log a mistake"
        description="Be honest. This is where growth hides."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!draft.description.trim()) return;
                upsert(draft);
                setOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Subject">
              <Select
                value={draft.subjectId}
                onChange={(e) =>
                  setDraft({ ...draft, subjectId: e.target.value })
                }
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select
                value={draft.type}
                onChange={(e) =>
                  setDraft({ ...draft, type: e.target.value as MistakeType })
                }
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Topic">
            <Input
              value={draft.topic}
              onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
              placeholder="e.g. Anti-Defection Law"
            />
          </Field>
          <Field label="What went wrong">
            <Textarea
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </Field>
          <Field label="Correction / takeaway">
            <Textarea
              value={draft.correction ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, correction: e.target.value })
              }
              placeholder="How will you get it right next time?"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
