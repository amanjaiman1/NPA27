"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Sunrise,
  Moon,
  Clock,
  BookOpen,
  Repeat,
  Target,
  Newspaper,
  Trophy,
  TriangleAlert,
  Lightbulb,
  NotebookPen,
  Quote,
  Paperclip,
  HeartPulse,
  ListChecks,
  BookMarked,
  Route,
} from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import type { FileRecord, JournalEntry } from "@/lib/types";
import { completedTopicsOf, findTopic } from "@/lib/topics";
import { filesByIds } from "@/lib/files";
import { STATUS_LABEL } from "@/lib/subjects";
import { FileTile } from "@/components/attachments/file-tile";
import { FilePreview } from "@/components/attachments/file-preview";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/misc";
import { JournalComposer } from "@/components/journal/composer";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  emptyEntry,
  toDraft,
  MOOD_LABELS,
  ENERGY_LABELS,
  MOTIVATION_LABELS,
  FOCUS_LABELS,
} from "@/components/journal/constants";
import {
  toISODate,
  fromISODate,
  daysBetween,
  formatHours,
  cn,
} from "@/lib/utils";
import { formatClock, timeFormatOf } from "@/lib/sleep";
import { itemsForJournalDay, planName, STATUS_LABEL as PLAN_STATUS } from "@/lib/roadmap";
import { roadmapHref } from "@/components/roadmap/shared";

function addDaysISO(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function RatingRow({
  label,
  value,
  labels,
}: {
  label: string;
  value: number;
  labels: string[];
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-paper/55">{label}</span>
      <div className="flex items-center gap-2.5">
        <span className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-4 rounded-full",
                i < value ? "bg-accent" : "bg-paper/15",
              )}
            />
          ))}
        </span>
        <span className="w-20 text-right text-xs text-paper/45">
          {labels[value]}
        </span>
      </div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 text-paper/55">
        <Icon className="h-4 w-4" />
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-wider">
          {title}
        </h3>
        {count !== undefined && (
          <span className="text-[0.7rem] text-paper/30">· {count}</span>
        )}
      </div>
      {children}
    </Card>
  );
}

export default function JournalDayPage() {
  const params = useParams();
  const router = useRouter();
  const hydrated = useHasHydrated();
  const journal = useChronicle((s) => s.journal);
  const subjects = useChronicle((s) => s.subjects);
  const profile = useChronicle((s) => s.profile);
  const clockOrDash = (t?: string) => (t ? formatClock(t, timeFormatOf(profile)) : "—");
  const deleteJournal = useChronicle((s) => s.deleteJournal);
  const confirm = useConfirm();

  const files = useChronicle((s) => s.files);
  const goals = useChronicle((s) => s.goals);
  const lifeLog = useChronicle((s) => s.lifeLog);

  const date = String(params?.date ?? "");
  const entry = useMemo(
    () => journal.find((e) => e.date === date),
    [journal, date],
  );
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<FileRecord | null>(null);
  const topics = useMemo(() => (entry ? completedTopicsOf(entry) : []), [entry]);
  const dayFiles = useMemo(() => filesByIds(files, entry?.fileIds), [files, entry]);
  const dayGoals = useMemo(() => goals.filter((g) => g.journalDates?.includes(date)), [goals, date]);
  const plans = useChronicle((s) => s.plans);
  const dayPlanned = useMemo(() => itemsForJournalDay(plans, date), [plans, date]);
  const life = useMemo(() => {
    const l = lifeLog.find((x) => x.date === date);
    return l && (l.sleepHours || l.exerciseMinutes || l.runKm || l.walkKm || l.note) ? l : null;
  }, [lifeLog, date]);

  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? "Unassigned";

  if (!hydrated) return <Loading />;

  const today = toISODate(new Date());
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const d = valid ? fromISODate(date) : new Date();
  const journeyDay = daysBetween(profile.startDate, date);
  const prev = addDaysISO(date, -1);
  const next = addDaysISO(date, 1);
  const isFuture = date > today;

  const fullDate = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const draft: JournalEntry = entry ? toDraft(entry) : emptyEntry(date);

  return (
    <div className="space-y-6">
      {/* Top nav */}
      <div className="flex items-center justify-between">
        <Link
          href="/journal"
          className="inline-flex items-center gap-2 text-sm text-paper/50 transition-colors hover:text-paper"
        >
          <ArrowLeft className="h-4 w-4" /> Journal
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href={`/journal/${prev}`}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-paper/55 transition-colors hover:border-paper/25 hover:text-paper"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link
            href={`/journal/${next}`}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-lg border border-line text-paper/55 transition-colors hover:border-paper/25 hover:text-paper",
              next > today && "pointer-events-none opacity-30",
            )}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2">
            {date === today
              ? "Today"
              : journeyDay >= 0
                ? `Day ${journeyDay} of the journey`
                : "Before Day Zero"}
          </p>
          <h1 className="font-display text-[2rem] font-bold tracking-tightest text-paper sm:text-[2.5rem]">
            {fullDate}
          </h1>
        </div>
        {entry && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="ghost"
              aria-label="Delete this entry"
              onClick={async () => {
                const own = dayFiles.filter((f) =>
                  journal.every((j) => j.date === date || !j.fileIds?.includes(f.id)),
                ).length;
                if (
                  await confirm({
                    title: "Delete this journal entry?",
                    description:
                      "This day's entry will be permanently removed" +
                      (own ? `, with its ${own} attached file${own === 1 ? "" : "s"}.` : "."),
                    confirmLabel: "Delete entry",
                  })
                ) {
                  deleteJournal(entry.date);
                  router.push("/journal");
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {!entry ? (
        <EmptyState
          icon={<NotebookPen className="h-5 w-5" />}
          title={isFuture ? "A day not yet lived" : "No entry for this day"}
          description={
            isFuture
              ? "You can't journal the future — but you can plan for it."
              : "This day is blank in your Chronicle. Want to fill it in?"
          }
          action={
            !isFuture ? (
              <Button onClick={() => setOpen(true)}>Create this entry</Button>
            ) : undefined
          }
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          {/* Rhythm + ratings */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-1">
              <div className="mb-3 flex items-center gap-2 text-paper/55">
                <Clock className="h-4 w-4" />
                <h3 className="text-[0.7rem] font-semibold uppercase tracking-wider">
                  Daily rhythm
                </h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-paper/55">
                    <Sunrise className="h-4 w-4 text-paper/40" /> Wake
                  </span>
                  <span className="tabular text-sm text-paper">
                    {clockOrDash(entry.wakeTime || lifeLog.find((l) => l.date === date)?.wakeTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-paper/55">
                    <Moon className="h-4 w-4 text-paper/40" /> Sleep
                  </span>
                  <span className="tabular text-sm text-paper">
                    {clockOrDash(entry.sleepTime || lifeLog.find((l) => l.date === date)?.bedtime)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-paper/[0.06] pt-3">
                  <span className="flex items-center gap-2 text-sm text-paper/55">
                    <Clock className="h-4 w-4 text-paper/40" /> Studied
                  </span>
                  <span className="tabular text-lg font-semibold text-paper">
                    {formatHours(entry.totalHours)}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="p-5 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2 text-paper/55">
                <Sunrise className="h-4 w-4" />
                <h3 className="text-[0.7rem] font-semibold uppercase tracking-wider">
                  State of mind
                </h3>
              </div>
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <RatingRow label="Mood" value={entry.mood} labels={MOOD_LABELS} />
                <RatingRow label="Energy" value={entry.energy} labels={ENERGY_LABELS} />
                <RatingRow
                  label="Motivation"
                  value={entry.motivation ?? entry.focus}
                  labels={MOTIVATION_LABELS}
                />
                <RatingRow label="Focus" value={entry.focus} labels={FOCUS_LABELS} />
              </div>
            </Card>
          </div>

          {/* Study breakdown */}
          {entry.blocks.length > 0 && (
            <SectionCard icon={Clock} title="Study breakdown">
              <div className="space-y-2.5">
                {entry.blocks.map((b, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-paper/75">
                      {subjectName(b.subjectId)}
                      {b.topics?.length ? (
                        <span className="text-paper/35"> · {b.topics.join(", ")}</span>
                      ) : null}
                    </span>
                    <Progress
                      value={(b.hours / entry.totalHours) * 100}
                      className="w-24"
                    />
                    <span className="tabular w-14 text-right text-xs text-paper/55">
                      {formatHours(b.hours)}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Files, goals and the life side of the same day */}
          {(dayFiles.length > 0 || dayGoals.length > 0 || dayPlanned.length > 0 || life) && (
            <div className="grid gap-4 lg:grid-cols-3">
              {dayFiles.length > 0 && (
                <SectionCard icon={Paperclip} title="Files" count={dayFiles.length}>
                  <ul className="space-y-1.5">
                    {dayFiles.map((f) => (
                      <li key={f.id}>
                        <FileTile record={f} onOpen={() => setPreview(f)} />
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
              {dayPlanned.length > 0 && (
                <SectionCard icon={Route} title="Planned work done this day" count={dayPlanned.length}>
                  <ul className="space-y-1.5">
                    {dayPlanned.map(({ plan, item }) => (
                      <li key={`${plan.id}:${item.id}`}>
                        <Link
                          href={roadmapHref({ plan: plan.id, item: item.id })}
                          className="flex items-center justify-between gap-2 text-sm text-paper/80 hover:text-accent"
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{item.title}</span>
                            <span className="block truncate text-[0.68rem] text-paper/55">
                              {PLAN_STATUS[item.status]} · {planName(plan)}
                            </span>
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-paper/40" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
              {dayGoals.length > 0 && (
                <SectionCard icon={Target} title="Goals this day served" count={dayGoals.length}>
                  <ul className="space-y-1.5">
                    {dayGoals.map((g) => (
                      <li key={g.id}>
                        <Link
                          href={`/goals?goal=${encodeURIComponent(g.id)}`}
                          className="flex items-center justify-between gap-2 text-sm text-paper/80 hover:text-accent"
                        >
                          <span className="min-w-0 truncate">{g.title}</span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-paper/40" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
              {life && (
                <SectionCard icon={HeartPulse} title="Life Dashboard">
                  <ul className="space-y-1.5 text-sm text-paper/75">
                    {life.sleepHours ? <li>Slept {formatHours(life.sleepHours)}</li> : null}
                    {life.exerciseMinutes ? (
                      <li>
                        {life.exerciseMinutes} min {life.exerciseType ? life.exerciseType.toLowerCase() : "exercise"}
                      </li>
                    ) : null}
                    {life.runKm ? <li>Ran {life.runKm} km</li> : null}
                    {life.walkKm ? <li>Walked {life.walkKm} km</li> : null}
                    {life.note ? <li className="text-paper/60">“{life.note}”</li> : null}
                  </ul>
                  <Link
                    href={`/wellbeing?date=${date}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                  >
                    Open this day <ChevronRight className="h-3 w-3" />
                  </Link>
                </SectionCard>
              )}
            </div>
          )}

          {/* What you covered */}
          <div className="grid gap-4 sm:grid-cols-2">
            {topics.length ? (
              <SectionCard icon={ListChecks} title="Topics completed" count={topics.length}>
                <ul className="flex flex-wrap gap-1.5">
                  {topics.map((t) => {
                    const found = t.topicId ? findTopic(subjects, t.topicId) : null;
                    return (
                      <li key={t.id}>
                        {found ? (
                          <Link
                            href={`/subjects?subject=${encodeURIComponent(found.subject.id)}`}
                            title={`${found.subject.name} · ${STATUS_LABEL[found.topic.status]}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper/[0.05] px-2.5 py-1 text-[0.72rem] font-semibold text-paper/80 transition-colors hover:border-accent/40 hover:text-accent"
                          >
                            <BookMarked className="h-3 w-3 text-accent" />
                            {found.topic.name}
                          </Link>
                        ) : (
                          <Badge tone="default">{t.name}</Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            ) : null}

            {entry.booksStudied?.length ? (
              <SectionCard icon={BookOpen} title="Books studied" count={entry.booksStudied.length}>
                <ul className="space-y-1.5">
                  {entry.booksStudied.map((b, i) => (
                    <li key={i} className="flex items-center justify-between text-sm text-paper/75">
                      <span className="min-w-0 truncate">{b.title}</span>
                      {b.fromPage != null && b.toPage != null && (
                        <span className="tabular shrink-0 text-xs text-paper/40">
                          p.{b.fromPage}–{b.toPage}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            {entry.revisionSessions?.length ? (
              <SectionCard icon={Repeat} title="Revision" count={entry.revisionSessions.length}>
                <ul className="space-y-1.5">
                  {entry.revisionSessions.map((r, i) => (
                    <li key={i} className="flex items-center justify-between text-sm text-paper/75">
                      <span className="min-w-0 truncate">
                        {r.topic}
                        {r.subjectId && (
                          <span className="text-paper/35"> · {subjectName(r.subjectId)}</span>
                        )}
                      </span>
                      {r.minutes != null && (
                        <span className="tabular shrink-0 text-xs text-paper/40">
                          {r.minutes}m
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            {entry.mocksAttempted?.length ? (
              <SectionCard icon={Target} title="Mocks attempted" count={entry.mocksAttempted.length}>
                <ul className="space-y-1.5">
                  {entry.mocksAttempted.map((m, i) => (
                    <li key={i} className="flex items-center justify-between text-sm text-paper/75">
                      <span className="min-w-0 truncate">{m.name}</span>
                      {m.score != null && m.max != null && (
                        <span className="tabular shrink-0 text-xs text-paper/40">
                          {m.score}/{m.max}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            {entry.currentAffairs?.length ? (
              <SectionCard icon={Newspaper} title="Current affairs" count={entry.currentAffairs.length}>
                <ul className="space-y-1.5">
                  {entry.currentAffairs.map((c, i) => (
                    <li key={i} className="flex items-center justify-between text-sm text-paper/75">
                      <span className="min-w-0 truncate">{c.title}</span>
                      {c.source && (
                        <span className="shrink-0 text-xs text-paper/40">{c.source}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}
          </div>

          {/* Narrative: wins / failures / lessons */}
          {(entry.wins?.length || entry.failures?.length || entry.lessons?.length) ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {entry.wins?.length ? (
                <SectionCard icon={Trophy} title="Wins">
                  <ul className="space-y-2">
                    {entry.wins.map((w, i) => (
                      <li key={i} className="flex gap-2 text-sm text-paper/70">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-paper/50" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : null}
              {entry.failures?.length ? (
                <SectionCard icon={TriangleAlert} title="Failures">
                  <ul className="space-y-2">
                    {entry.failures.map((w, i) => (
                      <li key={i} className="flex gap-2 text-sm text-paper/70">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-paper/50" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : null}
              {entry.lessons?.length ? (
                <SectionCard icon={Lightbulb} title="Lessons">
                  <ul className="space-y-2">
                    {entry.lessons.map((w, i) => (
                      <li key={i} className="flex gap-2 text-sm text-paper/70">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-paper/50" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : null}
            </div>
          ) : null}

          {/* Reflection */}
          {(entry.highlights || entry.reflection) && (
            <Card className="relative overflow-hidden p-6">
              <Quote className="absolute right-5 top-5 h-8 w-8 text-paper/[0.06]" />
              {entry.highlights && (
                <p className="font-display text-lg font-medium leading-snug text-paper/80">
                  {entry.highlights}
                </p>
              )}
              {entry.reflection && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-paper/60">
                  {entry.reflection}
                </p>
              )}
              {entry.tags?.length ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {entry.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-paper/[0.05] px-2 py-0.5 text-[0.65rem] text-paper/55"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}
            </Card>
          )}
        </motion.div>
      )}

      <JournalComposer
        open={open}
        onClose={() => setOpen(false)}
        initial={draft}
        onSaved={(e) => {
          if (e.date !== date) router.replace(`/journal/${e.date}`);
        }}
      />
      <FilePreview record={preview} open={Boolean(preview)} onClose={() => setPreview(null)} />
    </div>
  );
}
