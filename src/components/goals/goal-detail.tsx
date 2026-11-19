"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ChevronRight,
  Flag,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Route,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import type { FileRecord, Goal, GoalStatus, ISODate } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import {
  contributionSeries,
  goalCategory,
  goalPriority,
  healthLabel,
  milestoneCounts,
  paceNote,
  type GoalData,
  type GoalProgress,
} from "@/lib/goals";
import { filesByIds } from "@/lib/files";
import { STATUS_LABEL, goalLinks, planContext, planName } from "@/lib/roadmap";
import { roadmapHref } from "@/components/roadmap/shared";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { RadialProgress } from "@/components/ui/progress";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { FileLinker } from "@/components/attachments/file-linker";
import { FileTile } from "@/components/attachments/file-tile";
import { FilePreview } from "@/components/attachments/file-preview";
import { cn, formatDate, formatDayShort, formatHours, round, toISODate, uid } from "@/lib/utils";
import { HEALTH_TONE, PriorityLabel } from "./goal-card";

const STATUSES: GoalStatus[] = ["Active", "Completed", "Paused", "Missed"];

type Tab = "overview" | "progress" | "links" | "notes";

function Section({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{title}</p>
          {hint && <p className="mt-1 text-[0.72rem] text-paper/50">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="text-paper/60">{label}</span>
      <span className="tabular text-right font-semibold text-paper">{children}</span>
    </p>
  );
}

/**
 * Everything about one goal: where it stands, its milestones, its history,
 * the journal days and files that belong with it, and notes on how it's going.
 */
export function GoalDetail({
  p,
  data,
  onClose,
  onEdit,
  onDelete,
}: {
  p: GoalProgress | null;
  data: GoalData;
  onClose: () => void;
  onEdit: (g: Goal) => void;
  onDelete: (g: Goal) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const goalId = p?.goal.id;
  useEffect(() => {
    setTab("overview");
  }, [goalId]);

  if (!p) return null;
  const g = p.goal;
  const linkCount = (g.journalDates?.length ?? 0) + (g.fileIds?.length ?? 0);
  const noteCount = g.notes?.length ?? 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={g.title}
      description={`${goalCategory(g)} · ${g.horizon} · ${formatDate(p.window.start)} – ${formatDate(p.window.end)}`}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="danger" onClick={() => onDelete(g)} className="mr-auto">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => onEdit(g)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { label: "Overview", value: "overview" },
            { label: "Progress", value: "progress" },
            { label: linkCount ? `Journal & files · ${linkCount}` : "Journal & files", value: "links" },
            { label: noteCount ? `Notes · ${noteCount}` : "Notes", value: "notes" },
          ]}
          className="w-fit"
        />
        {tab === "overview" && <Overview p={p} />}
        {tab === "progress" && <ProgressTab p={p} data={data} />}
        {tab === "links" && <LinksTab goal={g} />}
        {tab === "notes" && <NotesTab goal={g} />}
      </div>
    </Modal>
  );
}

/* ── overview ─────────────────────────────────────────────────── */

function Overview({ p }: { p: GoalProgress }) {
  const g = p.goal;
  const setGoalStatus = useChronicle((s) => s.setGoalStatus);
  const unit = g.unit || p.metric.unit;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <RadialProgress
          value={p.pct ?? 0}
          size={88}
          stroke={8}
          ariaLabel="Progress towards the target"
          tone={
            p.health === "achieved"
              ? "positive"
              : p.health === "behind" || p.health === "missed"
                ? "danger"
                : p.health === "atRisk"
                  ? "warning"
                  : "accent"
          }
          label={p.pct == null ? "—" : `${p.pct}%`}
          sublabel="of target"
        />
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <Row label={p.tracked ? "Measured" : "Done so far"}>
            {p.current ?? "—"} {unit}
          </Row>
          <Row label="Target">{p.target != null ? `${p.target} ${unit}` : "None"}</Row>
          {p.expectedPct != null && g.status === "Active" && <Row label="Even pace by today">{p.expectedPct}%</Row>}
          {p.requiredPerDay != null && g.status === "Active" && p.window.daysLeft > 0 && (p.pct ?? 0) < 100 && (
            <Row label="Needed per day">
              {p.requiredPerDay} {unit}
            </Row>
          )}
          {p.perDay != null && (
            <Row label="Rate so far">
              {p.perDay} {unit}/day
            </Row>
          )}
          <p className="flex items-center justify-between gap-3 border-t border-line pt-1.5">
            <span className="text-paper/60">Standing</span>
            <Badge tone={HEALTH_TONE[p.health]}>{healthLabel(p.health)}</Badge>
          </p>
        </div>
      </div>

      <p className="rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5 text-[0.8rem] leading-relaxed text-paper/75">
        {paceNote(p)}
      </p>

      <div className="space-y-3">
        <div>
          <p className="eyebrow mb-2">Status</p>
          <Segmented
            value={g.status}
            onChange={(v) => setGoalStatus(g.id, v)}
            options={STATUSES.map((s) => ({ label: s, value: s }))}
            className="w-fit"
          />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] text-paper/65">
          <PriorityLabel priority={goalPriority(g)} />
          <span>Set on {formatDate(g.createdOn)}</span>
          {g.deadline && (
            <span className={cn(p.overdue && "font-semibold text-danger")}>
              Target date {formatDate(g.deadline)}
              {p.daysToDeadline != null &&
                g.status === "Active" &&
                (p.daysToDeadline < 0
                  ? ` · ${Math.abs(p.daysToDeadline)} days overdue`
                  : p.daysToDeadline === 0
                    ? " · due today"
                    : ` · ${p.daysToDeadline} days left`)}
            </span>
          )}
          {g.completedOn && <span className="text-positive">Completed on {formatDate(g.completedOn)}</span>}
        </p>
      </div>

      <MilestoneList goal={g} />

      <RoadmapRefs goal={g} />

      <Section title="Fed by">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/[0.02] p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
            <Link2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-paper">{p.metric.label}</p>
            <p className="text-[0.72rem] text-paper/55">{p.metric.hint}</p>
          </div>
          {p.tracked && p.metric.href !== "/goals" && (
            <Link
              href={p.metric.href}
              className="inline-flex shrink-0 items-center gap-1 text-[0.75rem] font-semibold text-accent transition-opacity hover:opacity-80"
            >
              {p.metric.source}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </Section>
    </div>
  );
}

/**
 * Where this goal appears in the Roadmap, read-only. Plans and activities
 * are edited there; nothing done in them changes this goal's progress.
 */
function RoadmapRefs({ goal }: { goal: Goal }) {
  const plans = useChronicle((s) => s.plans);
  const links = useMemo(() => goalLinks(plans, goal.id), [plans, goal.id]);
  const activities = links.items.filter((x) => x.item.kind === "activity");
  const done = activities.filter((x) => x.item.status === "completed").length;
  if (!links.plans.length && !links.items.length) {
    return (
      <Section title="In your roadmap" hint="Link this goal to a yearly, monthly or weekly plan to see when you mean to work on it.">
        <Link href="/roadmap" className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-accent hover:underline">
          Open the Roadmap <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </Section>
    );
  }
  return (
    <Section
      title="In your roadmap"
      hint={`Planning only.${activities.length ? ` ${done} of ${activities.length} planned activities done.` : ""} Ticking them off doesn't change this goal's progress.`}
    >
      <ul className="space-y-1.5">
        {links.plans.map((p) => (
          <li key={p.id}>
            <Link
              href={roadmapHref({ plan: p.id })}
              className="flex items-center gap-3 rounded-xl border border-line bg-paper/[0.02] px-3 py-2.5 hover:border-accent/35"
            >
              <Route className="h-4 w-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-paper">{planName(p)}</span>
                <span className="block truncate text-[0.68rem] text-paper/55">{planContext(p)}</span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-paper/45" />
            </Link>
          </li>
        ))}
        {links.items.slice(0, 8).map(({ plan, item }) => (
          <li key={`${plan.id}:${item.id}`}>
            <Link
              href={roadmapHref({ plan: plan.id, item: item.id })}
              className="flex items-center gap-3 rounded-xl px-3 py-1.5 text-[0.8rem] hover:bg-paper/[0.04]"
            >
              <span className={cn("min-w-0 flex-1 truncate text-paper/85", item.status === "completed" && "line-through decoration-paper/40")}>
                {item.kind === "milestone" && <Flag className="mr-1 inline h-3 w-3 align-[-1px] text-accent" aria-label="Roadmap milestone:" />}
                {item.title}
              </span>
              <span className="shrink-0 text-[0.68rem] text-paper/55">
                {STATUS_LABEL[item.status]} · {planName(plan)}
              </span>
            </Link>
          </li>
        ))}
        {links.items.length > 8 && <li className="px-3 text-[0.7rem] text-paper/55">and {links.items.length - 8} more in the Roadmap</li>}
      </ul>
    </Section>
  );
}

function MilestoneList({ goal }: { goal: Goal }) {
  const toggle = useChronicle((s) => s.toggleGoalMilestone);
  const upsertGoal = useChronicle((s) => s.upsertGoal);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const today = toISODate(new Date());
  const list = goal.milestones ?? [];
  const { done, total } = milestoneCounts(goal);

  function add() {
    const t = title.trim();
    if (!t) return;
    upsertGoal({
      ...goal,
      milestones: [...list, { id: uid("gm"), title: t.slice(0, 120), ...(due ? { dueOn: due } : {}) }],
    });
    setTitle("");
    setDue("");
  }
  function remove(id: string) {
    const next = list.filter((m) => m.id !== id);
    const g: Goal = { ...goal, milestones: next };
    if (!next.length) delete g.milestones;
    upsertGoal(g);
  }

  return (
    <Section
      title={total ? `Milestones · ${done} of ${total} done` : "Milestones"}
      hint={total ? undefined : "Break the goal into steps you can tick off."}
    >
      {total > 0 && (
        <ul className="space-y-1.5">
          {list.map((m) => {
            const late = !m.doneOn && m.dueOn && m.dueOn < today;
            return (
              <li key={m.id} className="group flex items-center gap-3 rounded-xl border border-line bg-paper/[0.02] px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggle(goal.id, m.id)}
                  aria-pressed={Boolean(m.doneOn)}
                  aria-label={m.doneOn ? `Mark “${m.title}” not done` : `Mark “${m.title}” done`}
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                    m.doneOn ? "border-positive bg-positive text-ink" : "border-paper/30 hover:border-accent",
                  )}
                >
                  {m.doneOn && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm text-paper", m.doneOn && "text-paper/55 line-through")}>{m.title}</p>
                  {(m.dueOn || m.doneOn) && (
                    <p className={cn("text-[0.68rem]", late ? "font-semibold text-danger" : "text-paper/50")}>
                      {m.doneOn
                        ? `Done ${formatDate(m.doneOn)}`
                        : late
                          ? `Was due ${formatDate(m.dueOn as ISODate)}`
                          : `Due ${formatDate(m.dueOn as ISODate)}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  aria-label={`Remove milestone “${m.title}”`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-paper/35 hover:bg-paper/[0.06] hover:text-paper sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a milestone…"
          aria-label="New milestone"
          maxLength={120}
          className="flex-1"
        />
        <div className="flex gap-2">
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="New milestone due date (optional)"
            className="w-full sm:w-40"
          />
          <Button type="submit" variant="ghost" disabled={!title.trim()} aria-label="Add milestone">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </Section>
  );
}

/* ── progress history ─────────────────────────────────────────── */

function ProgressTab({ p, data }: { p: GoalProgress; data: GoalData }) {
  const g = p.goal;
  const unit = g.unit || p.metric.unit;
  const today = toISODate(new Date());
  const series = useMemo(() => contributionSeries(g, data, today, 31), [g, data, today]);
  const log = g.progressLog ?? [];
  const doneSteps = (g.milestones ?? []).filter((m) => m.doneOn).sort((a, b) => (a.doneOn as string).localeCompare(b.doneOn as string));

  return (
    <div className="space-y-6">
      {!p.tracked && <LogProgress goal={g} unit={unit} target={p.target} />}

      {p.tracked && p.metric.id !== "milestones" && (
        <Section
          title="Day by day"
          hint={
            series.length >= 3
              ? `What each day added, read from ${p.metric.source}. Nothing to type in.`
              : p.metric.kind === "sum"
                ? "The chart appears once the window is a few days old."
                : `This measure is a reading of right now (${p.metric.label.toLowerCase()}), so it has no day-by-day history.`
          }
        >
          {series.length >= 3 && (
            <BarChart
              data={series.map((s) => ({
                label: formatDayShort(s.date).split(" ")[0],
                value: s.value,
                sublabel: formatDate(s.date),
              }))}
              height={140}
              formatValue={(v) => `${round(v, 1)} ${unit}`}
            />
          )}
        </Section>
      )}

      {p.metric.id === "milestones" && (
        <Section title="Milestones completed" hint={doneSteps.length ? undefined : "Nothing ticked off yet."}>
          {doneSteps.length > 0 && (
            <ol className="space-y-1.5">
              {doneSteps.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-paper">{m.title}</span>
                  <span className="shrink-0 text-[0.72rem] text-paper/55">{formatDate(m.doneOn as ISODate)}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      {(log.length > 0 || !p.tracked) && (
        <Section
          title="Readings"
          hint={
            log.length === 0
              ? "Each update is kept here with its date, so you can see how it moved."
              : p.tracked
                ? "Kept from when this goal was tracked by hand."
                : undefined
          }
        >
          {log.length >= 2 && (
            <LineChart
              data={log.map((r) => ({ label: formatDayShort(r.date), value: r.value, meta: formatDate(r.date) }))}
              height={150}
              target={p.target ?? undefined}
              formatValue={(v) => `${round(v, 1)}`}
            />
          )}
          {log.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-[0.78rem]">
                <thead className="bg-paper/[0.03] text-xs text-paper/50">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                    <th className="px-3 py-2 text-right font-semibold">Change</th>
                    <th className="hidden px-3 py-2 font-semibold sm:table-cell">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {[...log].reverse().map((r, i, arr) => {
                    const prev = arr[i + 1];
                    const change = prev ? round(r.value - prev.value, 2) : null;
                    return (
                      <tr key={r.id} className="border-t border-line align-top">
                        <td className="whitespace-nowrap px-3 py-2 text-paper/75">{formatDate(r.date)}</td>
                        <td className="tabular px-3 py-2 text-right font-semibold text-paper">
                          {r.value} {unit}
                        </td>
                        <td
                          className={cn(
                            "tabular px-3 py-2 text-right",
                            change == null ? "text-paper/40" : change > 0 ? "text-positive" : change < 0 ? "text-danger" : "text-paper/50",
                          )}
                        >
                          {change == null ? "first" : change > 0 ? `+${change}` : `${change}`}
                        </td>
                        <td className="hidden px-3 py-2 text-paper/65 sm:table-cell">{r.note ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function LogProgress({ goal, unit, target }: { goal: Goal; unit: string; target: number | null }) {
  const logGoalProgress = useChronicle((s) => s.logGoalProgress);
  const [value, setValue] = useState(String(goal.current ?? 0));
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const current = goal.current ?? 0;
  // A reading saved elsewhere (the card's quick update) moves the box too.
  useEffect(() => {
    setValue(String(current));
  }, [current]);
  const n = value.trim() === "" ? NaN : Number(value);
  const ok = Number.isFinite(n) && n >= 0;

  return (
    <Section title="Update progress" hint="Enter the new total. One reading is kept per day; a second update the same day replaces it.">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          logGoalProgress(goal.id, n, note);
          setNote("");
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2500);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="New total"
            aria-invalid={!ok}
            className="w-32"
          />
          <span className="text-sm text-paper/55">
            {target != null ? `of ${target} ${unit}` : unit}
          </span>
        </div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What moved it? (optional)" maxLength={200} aria-label="Note for this update" />
        {!ok && <p className="text-[0.72rem] text-danger">Enter a number of zero or more.</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={!ok}>
            Save reading
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[0.75rem] text-positive" role="status">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>
      </form>
    </Section>
  );
}

/* ── journal days and files ───────────────────────────────────── */

function LinksTab({ goal }: { goal: Goal }) {
  const journal = useChronicle((s) => s.journal);
  const files = useChronicle((s) => s.files);
  const setGoalJournalDates = useChronicle((s) => s.setGoalJournalDates);
  const [pick, setPick] = useState("");
  const [preview, setPreview] = useState<FileRecord | null>(null);
  const dates = useMemo(() => [...(goal.journalDates ?? [])].sort().reverse(), [goal.journalDates]);
  const byDate = useMemo(() => new Map(journal.map((e) => [e.date, e] as const)), [journal]);
  const available = useMemo(
    () =>
      [...journal]
        .filter((e) => !goal.journalDates?.includes(e.date))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 120),
    [journal, goal.journalDates],
  );
  /** Files that come with the linked days, beyond those linked to the goal directly. */
  const dayFiles = useMemo(() => {
    const direct = new Set(goal.fileIds ?? []);
    const ids: string[] = [];
    for (const d of dates) for (const id of byDate.get(d)?.fileIds ?? []) if (!direct.has(id) && !ids.includes(id)) ids.push(id);
    return filesByIds(files, ids);
  }, [dates, byDate, files, goal.fileIds]);

  return (
    <div className="space-y-6">
      <Section
        title="Journal days"
        hint="Days that served this goal. You can also tick the goal while writing a journal entry."
      >
        {dates.length > 0 ? (
          <ul className="space-y-1.5">
            {dates.map((d) => {
              const e = byDate.get(d);
              const n = e?.fileIds?.length ?? 0;
              return (
                <li key={d} className="flex items-center gap-3 rounded-xl border border-line bg-paper/[0.02] px-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {e ? (
                      <Link href={`/journal/${d}`} className="text-sm font-medium text-paper hover:text-accent hover:underline">
                        {formatDate(d)}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-paper/60">{formatDate(d)}</p>
                    )}
                    <p className="truncate text-[0.68rem] text-paper/50">
                      {e
                        ? [
                            e.totalHours > 0 ? `${formatHours(e.totalHours)} studied` : "No study hours",
                            n ? `${n} file${n === 1 ? "" : "s"}` : null,
                            e.highlights?.trim() || e.reflection?.trim() || null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "This journal day no longer exists."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGoalJournalDates(goal.id, (goal.journalDates ?? []).filter((x) => x !== d))}
                    aria-label={`Unlink ${formatDate(d)}`}
                    title="Unlink this day"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-paper/45 hover:bg-paper/[0.06] hover:text-paper"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[0.75rem] text-paper/50">No journal days linked yet.</p>
        )}
        {available.length > 0 ? (
          <div className="flex gap-2">
            <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Journal day to link" className="flex-1">
              <option value="">Link a journal day…</option>
              {available.map((e) => (
                <option key={e.date} value={e.date}>
                  {formatDate(e.date)}
                  {e.totalHours > 0 ? ` · ${formatHours(e.totalHours)}` : ""}
                  {e.fileIds?.length ? ` · ${e.fileIds.length} file${e.fileIds.length === 1 ? "" : "s"}` : ""}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              disabled={!pick}
              onClick={() => {
                setGoalJournalDates(goal.id, [...(goal.journalDates ?? []), pick]);
                setPick("");
              }}
            >
              <Link2 className="h-4 w-4" /> Link
            </Button>
          </div>
        ) : (
          journal.length === 0 && (
            <Link href="/journal?new=1" className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-accent hover:underline">
              Write today&rsquo;s journal entry <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )
        )}
      </Section>

      <Section title="Files" hint="Linked from your journal. The file stays with its journal day; unlinking never deletes it.">
        <FileLinker target={{ kind: "goal", id: goal.id }} fileIds={goal.fileIds} emptyHint="No files linked to this goal." />
      </Section>

      {dayFiles.length > 0 && (
        <Section title="On the linked days" hint="Files attached to the journal days above.">
          <ul className="space-y-1.5">
            {dayFiles.map((f) => (
              <li key={f.id}>
                <FileTile record={f} onOpen={() => setPreview(f)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      <FilePreview record={preview} open={Boolean(preview)} onClose={() => setPreview(null)} />
      {dates.length === 0 && !goal.fileIds?.length && files.length === 0 && (
        <p className="flex items-center gap-2 text-[0.75rem] text-paper/50">
          <Paperclip className="h-3.5 w-3.5" /> Attach notes or photos to a journal day, then link them here.
        </p>
      )}
    </div>
  );
}

/* ── notes and reflections ────────────────────────────────────── */

function NotesTab({ goal }: { goal: Goal }) {
  const addGoalNote = useChronicle((s) => s.addGoalNote);
  const deleteGoalNote = useChronicle((s) => s.deleteGoalNote);
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const notes = [...(goal.notes ?? [])].reverse();

  return (
    <div className="space-y-5">
      <Section title="Add a note" hint="What's working, what isn't, what to change. Each note is dated.">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            addGoalNote(goal.id, text);
            setText("");
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Mornings work better for this; evenings keep slipping."
            maxLength={2000}
            aria-label="New note"
            className="min-h-[72px]"
          />
          <Button type="submit" size="sm" disabled={!text.trim()}>
            Add note
          </Button>
        </form>
      </Section>

      <Section title={notes.length ? `Notes · ${notes.length}` : "Notes"}>
        {notes.length === 0 ? (
          <p className="text-[0.75rem] text-paper/50">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="group rounded-xl border border-line bg-paper/[0.02] px-3.5 py-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[0.68rem] font-semibold text-paper/50">{formatDate(n.date)}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Delete this note?",
                          description: "The note will be removed from the goal.",
                          confirmLabel: "Delete note",
                        })
                      )
                        deleteGoalNote(goal.id, n.id);
                    }}
                    aria-label={`Delete note from ${formatDate(n.date)}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-paper/35 hover:bg-danger/10 hover:text-danger sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper/85">{n.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
