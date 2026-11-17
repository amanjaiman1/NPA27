"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Quote,
  Heart,
  Trash2,
  Pencil,
  Search,
  Flame,
  Shuffle,
  Sparkles,
  NotebookPen,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { Reflection } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Chip } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea, Select, RatingPicker } from "@/components/ui/form";
import { LineChart } from "@/components/charts/line-chart";
import {
  MOOD_WORDS,
  PROMPT_GROUPS,
  ALL_PROMPTS,
  promptOfTheDay,
  reflectionStats,
  moodSeries,
  gratitudeCounts,
} from "@/lib/reflection";
import { formatDate, formatDayShort, toISODate, uid, cn } from "@/lib/utils";

function emptyReflection(today: string, prompt: string): Reflection {
  return {
    id: uid("ref"),
    date: today,
    prompt,
    content: "",
    mood: 3,
    gratitude: [],
  };
}

function MoodPips({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < value ? "bg-accent" : "bg-paper/15",
          )}
        />
      ))}
    </span>
  );
}

type MoodFilter = "all" | "low" | "high";

export default function ReflectionsPage() {
  const hydrated = useHasHydrated();
  const reflections = useChronicle((s) => s.reflections);
  const journal = useChronicle((s) => s.journal);
  const upsert = useChronicle((s) => s.upsertReflection);
  const remove = useChronicle((s) => s.deleteReflection);
  const confirm = useConfirm();

  const today = toISODate(new Date());
  const daily = promptOfTheDay(today);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Reflection>(() => emptyReflection(today, daily));
  const [gratInput, setGratInput] = useState("");
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState<MoodFilter>("all");

  const stats = useMemo(() => reflectionStats(reflections, today), [reflections, today]);
  const series = useMemo(() => moodSeries(reflections, 30), [reflections]);
  const gratitude = useMemo(() => gratitudeCounts(reflections), [reflections]);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...reflections]
      .filter((r) => {
        if (mood === "low" && r.mood > 2) return false;
        if (mood === "high" && r.mood < 4) return false;
        if (!q) return true;
        return (
          r.content.toLowerCase().includes(q) ||
          (r.prompt ?? "").toLowerCase().includes(q) ||
          (r.gratitude ?? []).some((g) => g.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [reflections, query, mood]);

  /** Days you wrote a journal reflection but never came here — worth surfacing. */
  const journalOnly = useMemo(() => {
    const written = new Set(reflections.map((r) => r.date));
    return journal
      .filter((e) => (e.reflection ?? "").trim().length > 0 && !written.has(e.date))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
  }, [journal, reflections]);

  if (!hydrated) return <Loading />;

  function openNew(prompt = daily) {
    setDraft(emptyReflection(today, prompt));
    setGratInput("");
    setEditing(false);
    setOpen(true);
  }
  function openEdit(r: Reflection) {
    setDraft({ ...r });
    setGratInput((r.gratitude ?? []).join(", "));
    setEditing(true);
    setOpen(true);
  }
  async function save() {
    if (!draft.content.trim()) return;
    if (
      !(await confirm({
        title: editing ? "Save changes to this reflection?" : "Save this reflection?",
        description: editing
          ? "Your edits will be kept."
          : "It will be added to your reflection journal.",
        tone: "default",
        confirmLabel: editing ? "Save changes" : "Save",
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
  }
  async function del(r: Reflection) {
    if (
      await confirm({
        title: "Delete this reflection?",
        description: "This private entry will be permanently removed.",
        confirmLabel: "Delete",
      })
    )
      remove(r.id);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Emotional Reflection Journal"
        title="The inner game."
        description="UPSC is as much an emotional marathon as an intellectual one. This is the private space to process the weight of the journey — and to see, over time, which way it's tilting."
        actions={
          <Button onClick={() => openNew()}>
            <Plus className="h-4 w-4" /> Reflect
          </Button>
        }
      />

      {/* Today's prompt */}
      <Card className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <Quote className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-1">Today&rsquo;s prompt</p>
          <p className="font-display text-base font-medium leading-snug text-paper sm:text-lg">
            {daily}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              openNew(ALL_PROMPTS[Math.floor(Math.random() * ALL_PROMPTS.length)])
            }
          >
            <Shuffle className="h-4 w-4" /> Another
          </Button>
          <Button onClick={() => openNew()}>Answer it</Button>
        </div>
      </Card>

      {reflections.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                icon: NotebookPen,
                label: "Reflections",
                value: `${stats.total}`,
                hint: `${stats.thisMonth} this month`,
              },
              {
                icon: Flame,
                label: "Streak",
                value: `${stats.streak}d`,
                hint: `longest ${stats.longestStreak}d`,
              },
              {
                icon: Sparkles,
                label: "Average mood",
                value: stats.avgMood == null ? "—" : `${stats.avgMood}/5`,
                hint:
                  stats.moodDrift == null
                    ? "not enough entries"
                    : stats.moodDrift === 0
                      ? "holding steady"
                      : `${stats.moodDrift > 0 ? "up" : "down"} ${Math.abs(stats.moodDrift)} lately`,
                drift: stats.moodDrift,
              },
              {
                icon: Heart,
                label: "Gratitudes",
                value: `${stats.gratitudeCount}`,
                hint: `~${stats.avgLength} chars an entry`,
              },
            ].map((s) => (
              <Card key={s.label} className="p-4 sm:p-5">
                <div className="flex items-center gap-2 text-paper/45">
                  <s.icon className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate text-[0.62rem] font-semibold uppercase tracking-[0.08em]">
                    {s.label}
                  </span>
                  {s.drift != null && s.drift !== 0 && (
                    <span
                      className={cn(s.drift > 0 ? "text-positive" : "text-danger")}
                    >
                      {s.drift > 0 ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  )}
                </div>
                <p className="tabular mt-2 font-display text-[1.6rem] font-bold leading-none tracking-tightest text-paper">
                  {s.value}
                </p>
                <p className="mt-1 truncate text-[0.7rem] text-paper/45">{s.hint}</p>
              </Card>
            ))}
          </div>

          {/* Mood over time */}
          {series.length > 2 && (
            <Card className="p-5 sm:p-6">
              <p className="eyebrow mb-1">The tilt</p>
              <h2 className="mb-5 text-base font-semibold text-paper">
                Mood across your last {series.length} reflections
              </h2>
              <LineChart
                data={series.map((s) => ({
                  label: formatDayShort(s.date),
                  value: s.mood,
                  meta: `${formatDate(s.date)} · ${MOOD_WORDS[s.mood]}`,
                }))}
                height={180}
                formatValue={(v) => `${v}/5 ${MOOD_WORDS[Math.round(v)] ?? ""}`}
              />
            </Card>
          )}

          {/* Filters */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reflections, prompts, gratitude…"
                className="pl-10"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Chip active={mood === "all"} onClick={() => setMood("all")}>
                All
              </Chip>
              <Chip active={mood === "low"} onClick={() => setMood("low")}>
                Heavy days
              </Chip>
              <Chip active={mood === "high"} onClick={() => setMood("high")}>
                Light days
              </Chip>
            </div>
          </div>
        </>
      )}

      {reflections.length === 0 ? (
        <EmptyState
          icon={<Quote className="h-5 w-5" />}
          title="A quiet page awaits"
          description="Write your first reflection. No one else will read it."
          action={<Button onClick={() => openNew()}>Begin</Button>}
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="Nothing matches"
          description="Try a different search, or clear the mood filter."
        />
      ) : (
        <div className="columns-1 gap-4 md:columns-2 [&>*]:mb-4">
          {sorted.map((r) => (
            <Card key={r.id} className="group break-inside-avoid p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-paper/40">{formatDate(r.date)}</p>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => openEdit(r)}
                    aria-label={`Edit reflection from ${r.date}`}
                    title="Edit reflection"
                    className="grid h-7 w-7 place-items-center rounded-lg text-paper/25 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => del(r)}
                    aria-label={`Delete reflection from ${r.date}`}
                    title="Delete reflection"
                    className="grid h-7 w-7 place-items-center rounded-lg text-paper/25 transition-colors hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {r.prompt && (
                <p className="mt-2 font-display text-base font-medium leading-snug text-paper/75">
                  {r.prompt}
                </p>
              )}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-paper/60">
                {r.content}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-paper/[0.06] pt-3">
                <span className="flex items-center gap-1.5 text-[0.7rem] text-paper/40">
                  Mood
                  <MoodPips value={r.mood} />
                  {MOOD_WORDS[r.mood]}
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

      {/* What you keep being grateful for */}
      {gratitude.length > 2 && (
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Heart className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold tracking-snugg text-paper">
              What keeps coming back
            </h2>
            <span className="text-[0.7rem] text-paper/40">
              your most repeated gratitudes
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {gratitude.slice(0, 18).map((g) => (
              <span
                key={g.text}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper/[0.03] px-2.5 py-1 text-[0.72rem] text-paper/70"
                style={{ fontSize: `${Math.min(0.95, 0.72 + g.count * 0.04)}rem` }}
              >
                {g.text}
                {g.count > 1 && (
                  <span className="tabular text-[0.66rem] text-paper/40">
                    ×{g.count}
                  </span>
                )}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Days you wrote in the journal but not here */}
      {journalOnly.length > 0 && (
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-paper/45" />
            <h2 className="text-sm font-semibold tracking-snugg text-paper">
              Written in the journal, not here
            </h2>
          </div>
          <p className="mb-4 text-xs text-paper/45">
            These days carry a personal reflection in the study journal. Bring one
            across if it deserves the space.
          </p>
          <ul className="space-y-2">
            {journalOnly.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/[0.02] p-3.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.7rem] text-paper/40">
                    {formatDate(e.date)}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-paper/70">
                    {e.reflection}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft({
                      id: uid("ref"),
                      date: e.date,
                      prompt: "Carried over from the study journal",
                      content: e.reflection ?? "",
                      mood: e.mood,
                      gratitude: [],
                    });
                    setGratInput("");
                    setEditing(false);
                    setOpen(true);
                  }}
                >
                  Bring across
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Composer */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit reflection" : "New reflection"}
        description={
          editing ? undefined : "Nobody else reads this. Write it badly if you like."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!draft.content.trim()}>
              {editing ? "Save changes" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Prompt">
              <Select
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              >
                {/* Grouped so the choice is between kinds of question, not
                    twenty interchangeable lines. */}
                {PROMPT_GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.prompts.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {draft.prompt && !ALL_PROMPTS.includes(draft.prompt) && (
                  <option value={draft.prompt}>{draft.prompt}</option>
                )}
              </Select>
            </Field>
            <Field label="Date">
              <Input
                type="date"
                max={today}
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
          </div>
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
              labels={MOOD_WORDS.slice(1)}
            />
          </Field>
          <Field label="Grateful for" hint="comma separated">
            <Input
              value={gratInput}
              onChange={(e) => setGratInput(e.target.value)}
              placeholder="Family, good health, a quiet morning"
            />
          </Field>
          {gratitude.length > 0 && !editing && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.66rem] uppercase tracking-wider text-paper/35">
                Recent
              </span>
              {gratitude.slice(0, 5).map((g) => (
                <button
                  key={g.text}
                  type="button"
                  onClick={() =>
                    setGratInput((cur) => (cur.trim() ? `${cur}, ${g.text}` : g.text))
                  }
                  className="rounded-full border border-line px-2.5 py-1 text-[0.7rem] text-paper/60 transition-colors hover:border-paper/25 hover:text-paper"
                >
                  {g.text}
                </button>
              ))}
            </div>
          )}
          {editing && (
            <Badge tone="ghost">
              Editing the entry from {formatDate(draft.date)}
            </Badge>
          )}
        </div>
      </Modal>
    </div>
  );
}
