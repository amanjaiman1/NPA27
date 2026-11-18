import type {
  Goal,
  ISODate,
  JournalEntry,
  PlanItem,
  PlanItemKind,
  PlanItemRef,
  PlanItemStatus,
  PlanLevel,
  PlanPriority,
  PlanReview,
  RoadmapPlan,
  Subject,
} from "./types";
import { daysBetween, fromISODate, round, toISODate, uid } from "./utils";
import { countCompletedTopics } from "./topics";

/* ════════════════════════════════════════════════════════════════
   THE ROADMAP — your own plans, by year, month and week.

   Nothing here is pre-written. A plan is a period (its dates are the
   source of truth), what you mean to do in it, and the activities and
   milestones you add. Months can sit under a year and weeks under a
   month or a year, but every level also works on its own.

   What this module keeps apart, on purpose:
     planning      the plans and their activities (here)
     working       an activity's status, set by you (here)
     recording     the Daily Journal, linked to activities only by you
     achieving     Goals, which keep their own progress; a plan links to
                   a goal by id and never changes it

   Everything is a pure function of the plans (and, where it says so,
   the journal), so it can be tested without a store.
   ════════════════════════════════════════════════════════════════ */

/* ── constants ───────────────────────────────────────────────────── */

export const PLAN_LEVELS: PlanLevel[] = ["year", "month", "week"];

export const LEVEL_LABEL: Record<PlanLevel, string> = {
  year: "Yearly plan",
  month: "Monthly plan",
  week: "Weekly plan",
};

export const LEVEL_NOUN: Record<PlanLevel, string> = { year: "year", month: "month", week: "week" };

export const ITEM_STATUSES: PlanItemStatus[] = ["notStarted", "inProgress", "completed", "deferred"];

export const STATUS_LABEL: Record<PlanItemStatus, string> = {
  notStarted: "Not started",
  inProgress: "In progress",
  completed: "Completed",
  deferred: "Deferred",
};

export const PLAN_PRIORITIES: PlanPriority[] = ["High", "Medium", "Low"];

/** Suggestions for an activity's category. Any label can be typed instead. */
export const CATEGORY_SUGGESTIONS = [
  "Reading",
  "Lectures",
  "Notes",
  "Revision",
  "Answer writing",
  "Practice test",
  "Current affairs",
  "Optional",
];

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Monday, as in the rest of the app. */
export const DEFAULT_WEEK_START = 1;

/** Limits that keep plans readable and the synced copy small. */
export const LIMITS = {
  title: 120,
  itemTitle: 160,
  text: 2000,
  objectives: 20,
  items: 200,
  /** A "year" plan may run past twelve months, but not past two years. */
  yearSpanDays: 731,
};

/* ── dates ───────────────────────────────────────────────────────
   Calendar dates ("yyyy-mm-dd") throughout, read in the device's own
   calendar like every other date in the app. Arithmetic steps days with
   `setDate`, so a clock change never adds or loses one. */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in `yyyy-mm-dd` form (so not 2027-02-30). */
export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== "string") return false;
  const m = ISO_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

/** Days in a month (1–12), leap years included. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function normalizeWeekStart(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6 ? v : DEFAULT_WEEK_START;
}

/** The first day of the week containing `iso`, for weeks that start on `weekStart`. */
export function weekStartOf(iso: ISODate, weekStart = DEFAULT_WEEK_START): ISODate {
  const back = (fromISODate(iso).getDay() - normalizeWeekStart(weekStart) + 7) % 7;
  return addDays(iso, -back);
}

/** A week is seven days from its start. */
export function weekEnd(start: ISODate): ISODate {
  return addDays(start, 6);
}

/**
 * The month a week counts towards by default: the one holding its fourth
 * day, so the month with most of the week (the rule ISO week numbers use).
 */
export function weekHomeMonth(start: ISODate): string {
  return monthKeyOf(addDays(start, 3));
}

/** "2027-01" for any date in January 2027. */
export function monthKeyOf(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function monthStart(key: string): ISODate {
  return `${key}-01`;
}

export function monthEnd(key: string): ISODate {
  const [y, m] = key.split("-").map(Number);
  return `${key}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string, short = false): string {
  const [y, m] = key.split("-").map(Number);
  return `${(short ? MONTH_SHORT : MONTH_NAMES)[m - 1]} ${y}`;
}

export function monthName(key: string, short = false): string {
  const m = Number(key.slice(5, 7));
  return (short ? MONTH_SHORT : MONTH_NAMES)[m - 1];
}

/** Every month key from the month of `start` to the month of `end`, inclusive. */
export function monthsBetween(start: ISODate, end: ISODate): string[] {
  const out: string[] = [];
  const last = monthKeyOf(end);
  for (let k = monthKeyOf(start); k <= last && out.length < 36; k = addMonths(k, 1)) out.push(k);
  return out;
}

export function yearRange(year: number): { start: ISODate; end: ISODate } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Whole days two date ranges share (0 when they don't touch). */
export function overlapDays(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate): number {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  return s > e ? 0 : daysBetween(s, e) + 1;
}

/** The aligned weeks that touch a month, by their first day. */
export function weeksOfMonth(key: string, weekStart = DEFAULT_WEEK_START): ISODate[] {
  const out: ISODate[] = [];
  const end = monthEnd(key);
  for (let s = weekStartOf(monthStart(key), weekStart); s <= end && out.length < 7; s = addDays(s, 7)) out.push(s);
  return out;
}

function day(iso: ISODate): number {
  return Number(iso.slice(8, 10));
}

/** "4 – 10 Jan 2027", "28 Jan – 3 Feb 2027", "29 Dec 2026 – 4 Jan 2027". */
export function formatSpan(start: ISODate, end: ISODate): string {
  const [sy, sm] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  const [ey, em] = [Number(end.slice(0, 4)), Number(end.slice(5, 7))];
  if (sy !== ey) return `${day(start)} ${MONTH_SHORT[sm - 1]} ${sy} – ${day(end)} ${MONTH_SHORT[em - 1]} ${ey}`;
  if (sm !== em) return `${day(start)} ${MONTH_SHORT[sm - 1]} – ${day(end)} ${MONTH_SHORT[em - 1]} ${ey}`;
  return `${day(start)} – ${day(end)} ${MONTH_SHORT[em - 1]} ${ey}`;
}

/** "4 Jan 2027". */
export function formatDay(iso: ISODate): string {
  return `${day(iso)} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** "4 Jan". */
export function formatDayShort(iso: ISODate): string {
  return `${day(iso)} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}`;
}

/** Same month and day `n` years on; 29 February becomes the 28th when it must. */
export function shiftYears(iso: ISODate, n: number): ISODate {
  const y = Number(iso.slice(0, 4)) + n;
  const m = Number(iso.slice(5, 7));
  const d = Math.min(day(iso), daysInMonth(y, m));
  return `${y}-${iso.slice(5, 7)}-${String(d).padStart(2, "0")}`;
}

/** The same day of the month in another month, clamped to its last day. */
export function shiftToMonth(iso: ISODate, toKey: string): ISODate {
  const [y, m] = toKey.split("-").map(Number);
  const d = Math.min(day(iso), daysInMonth(y, m));
  return `${toKey}-${String(d).padStart(2, "0")}`;
}

/* ── names ───────────────────────────────────────────────────────── */

function isCalendarYear(p: Pick<RoadmapPlan, "start" | "end" | "year">): boolean {
  return p.year != null && p.start === `${p.year}-01-01` && p.end === `${p.year}-12-31`;
}

/** The plan's dates in words: "2027", "January 2027", "4 – 10 Jan 2027". */
export function periodLabel(plan: Pick<RoadmapPlan, "level" | "start" | "end" | "year">): string {
  if (plan.level === "month") return monthLabel(monthKeyOf(plan.start));
  if (plan.level === "week") return formatSpan(plan.start, plan.end);
  if (isCalendarYear(plan)) return String(plan.year);
  return `${monthLabel(monthKeyOf(plan.start), true)} – ${monthLabel(monthKeyOf(plan.end), true)}`;
}

/** What to call a plan: its title, or its period when it has none. */
export function planName(plan: Pick<RoadmapPlan, "level" | "start" | "end" | "year" | "title">): string {
  const t = plan.title?.trim();
  if (t) return t;
  if (plan.level === "year") return `${plan.year ?? plan.start.slice(0, 4)}`;
  if (plan.level === "month") return monthLabel(monthKeyOf(plan.start));
  return `Week of ${formatDay(plan.start)}`;
}

/**
 * A line to go under a plan's name in a list: "Monthly plan" when the name is
 * already the period, "Weekly plan · 16 – 22 Nov 2026" when it has a title.
 */
export function planContext(plan: Pick<RoadmapPlan, "level" | "start" | "end" | "year" | "title">): string {
  return plan.title?.trim() ? `${LEVEL_LABEL[plan.level]} · ${periodLabel(plan)}` : LEVEL_LABEL[plan.level];
}

/* ── making plans and items ──────────────────────────────────────── */

const now = () => new Date().toISOString();

/** A new, empty plan for a period. Nothing is filled in. */
export function blankPlan(
  level: PlanLevel,
  at: { year?: number; month?: string; start?: ISODate },
  stamp: string = now(),
): RoadmapPlan {
  let start: ISODate;
  let end: ISODate;
  let year: number | undefined;
  if (level === "year") {
    year = at.year ?? Number((at.start ?? toISODate(new Date())).slice(0, 4));
    ({ start, end } = yearRange(year));
  } else if (level === "month") {
    const key = at.month ?? monthKeyOf(at.start ?? toISODate(new Date()));
    start = monthStart(key);
    end = monthEnd(key);
  } else {
    start = at.start ?? weekStartOf(toISODate(new Date()));
    end = weekEnd(start);
  }
  return {
    id: uid(level === "year" ? "yr" : level === "month" ? "mo" : "wk"),
    level,
    ...(year != null ? { year } : {}),
    start,
    end,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function blankItem(kind: PlanItemKind, title: string, stamp: string = now()): PlanItem {
  return {
    id: uid(kind === "milestone" ? "pm" : "pa"),
    kind,
    title: title.trim().slice(0, LIMITS.itemTitle),
    status: "notStarted",
    createdAt: stamp,
  };
}

/**
 * A status change, with the completion time kept in step. An activity that
 * was carried forward keeps that link; taking it back is `undoCarry`.
 */
export function withStatus(item: PlanItem, status: PlanItemStatus, stamp: string = now()): PlanItem {
  if (item.status === status) return item;
  const next: PlanItem = { ...item, status };
  if (status === "completed") next.completedAt = item.completedAt ?? stamp;
  else delete next.completedAt;
  return next;
}

/** The level a plan's children are, if it can have any. */
export function childLevel(level: PlanLevel): PlanLevel | null {
  return level === "year" ? "month" : level === "month" ? "week" : null;
}

/* ── the hierarchy ───────────────────────────────────────────────── */

/** Which levels can hold which. Weeks may sit straight under a year. */
export function canParent(parent: PlanLevel, child: PlanLevel): boolean {
  return (child === "month" && parent === "year") || (child === "week" && (parent === "month" || parent === "year"));
}

export function plansById(plans: RoadmapPlan[]): Map<string, RoadmapPlan> {
  return new Map(plans.map((p) => [p.id, p] as const));
}

const byStart = (a: RoadmapPlan, b: RoadmapPlan) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id);

export function childrenOf(plans: RoadmapPlan[], id: string): RoadmapPlan[] {
  return plans.filter((p) => p.parentId === id).sort(byStart);
}

/** Every plan under `id`, at any depth. */
export function descendantIds(plans: RoadmapPlan[], id: string): Set<string> {
  const out = new Set<string>();
  let frontier = [id];
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next: string[] = [];
    for (const p of plans) {
      if (p.parentId && frontier.includes(p.parentId) && !out.has(p.id) && p.id !== id) {
        out.add(p.id);
        next.push(p.id);
      }
    }
    frontier = next;
  }
  return out;
}

/** The plans above this one, nearest first. */
export function ancestorsOf(plans: RoadmapPlan[], plan: RoadmapPlan): RoadmapPlan[] {
  const map = plansById(plans);
  const out: RoadmapPlan[] = [];
  let cur = plan.parentId ? map.get(plan.parentId) : undefined;
  while (cur && out.length < 3 && !out.includes(cur)) {
    out.push(cur);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return out;
}

/** Archived itself, or inside an archived plan. */
export function isArchived(plans: RoadmapPlan[], plan: RoadmapPlan): boolean {
  return Boolean(plan.archivedAt) || ancestorsOf(plans, plan).some((a) => a.archivedAt);
}

export function activePlans(plans: RoadmapPlan[]): RoadmapPlan[] {
  return plans.filter((p) => !isArchived(plans, p));
}

/** Plans this one could sit under: the right level, overlapping dates, not archived. */
export function parentCandidates(plans: RoadmapPlan[], child: Pick<RoadmapPlan, "id" | "level" | "start" | "end">): RoadmapPlan[] {
  return plans
    .filter(
      (p) =>
        p.id !== child.id &&
        canParent(p.level, child.level) &&
        !isArchived(plans, p) &&
        overlapDays(p.start, p.end, child.start, child.end) > 0,
    )
    .sort((a, b) => (a.level === b.level ? byStart(a, b) : a.level === "month" ? -1 : 1));
}

/**
 * Where a new plan would naturally go: a month under the year plan for its
 * year, a week under the month that holds most of it (or else that day's
 * year plan). Only a suggestion; the form shows it and you can change it.
 */
export function suggestedParent(
  plans: RoadmapPlan[],
  child: Pick<RoadmapPlan, "id" | "level" | "start" | "end">,
): string | undefined {
  const options = parentCandidates(plans, child);
  if (child.level === "month") {
    const y = Number(child.start.slice(0, 4));
    return (options.find((p) => p.year === y) ?? options.find((p) => p.start <= child.start && child.start <= p.end))?.id;
  }
  if (child.level === "week") {
    const home = weekHomeMonth(child.start);
    const mid = addDays(child.start, 3);
    return (
      options.find((p) => p.level === "month" && monthKeyOf(p.start) === home) ??
      options.find((p) => p.level === "year" && p.start <= mid && mid <= p.end)
    )?.id;
  }
  return undefined;
}

/* ── one plan per period ─────────────────────────────────────────── */

/** The period a plan claims: its year, its month, or its first day. */
export function periodKey(plan: Pick<RoadmapPlan, "level" | "start" | "year">): string {
  if (plan.level === "year") return `year:${plan.year ?? plan.start.slice(0, 4)}`;
  if (plan.level === "month") return `month:${monthKeyOf(plan.start)}`;
  return `week:${plan.start}`;
}

/** Another plan already planned for the same period, if there is one. */
export function samePeriod(plans: RoadmapPlan[], plan: Pick<RoadmapPlan, "id" | "level" | "start" | "year">): RoadmapPlan | undefined {
  const key = periodKey(plan);
  return plans.find((p) => p.id !== plan.id && periodKey(p) === key);
}

/** Groups of plans that claim the same period (two devices, offline, can each make one). */
export function periodClashes(plans: RoadmapPlan[]): RoadmapPlan[][] {
  const groups = new Map<string, RoadmapPlan[]>();
  for (const p of plans) groups.set(periodKey(p), [...(groups.get(periodKey(p)) ?? []), p]);
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Weekly plans whose dates overlap this one's. Allowed, but worth saying. */
export function overlappingWeeks(plans: RoadmapPlan[], week: Pick<RoadmapPlan, "id" | "start" | "end">): RoadmapPlan[] {
  return plans.filter((p) => p.level === "week" && p.id !== week.id && overlapDays(p.start, p.end, week.start, week.end) > 0);
}

/* ── checks before saving ────────────────────────────────────────── */

export type PlanErrors = Partial<Record<"title" | "year" | "dates" | "period" | "parent", string>>;

export function validatePlan(plan: RoadmapPlan, plans: RoadmapPlan[]): PlanErrors {
  const errors: PlanErrors = {};
  if ((plan.title ?? "").trim().length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;

  if (plan.level === "year") {
    if (!Number.isInteger(plan.year) || (plan.year as number) < 2000 || (plan.year as number) > 2100) {
      errors.year = "Choose a year between 2000 and 2100.";
    }
  }
  if (!isISODate(plan.start) || !isISODate(plan.end)) errors.dates = "Pick valid dates.";
  else if (plan.end < plan.start) errors.dates = "The end date is before the start date.";
  else if (plan.level === "year") {
    if (daysBetween(plan.start, plan.end) + 1 > LIMITS.yearSpanDays) errors.dates = "A yearly plan can run for two years at most.";
    else if (plan.year != null && overlapDays(plan.start, plan.end, `${plan.year}-01-01`, `${plan.year}-12-31`) === 0) {
      errors.dates = `The dates should include some of ${plan.year}.`;
    }
  }

  if (!errors.year && !errors.dates) {
    const twin = samePeriod(plans, plan);
    if (twin) {
      errors.period = `You already have a plan for ${periodLabel(twin)}${twin.archivedAt ? " (archived)" : ""}. Open that one instead.`;
    }
  }

  if (plan.parentId) {
    const parent = plans.find((p) => p.id === plan.parentId);
    if (!parent) errors.parent = "That plan no longer exists.";
    else if (!canParent(parent.level, plan.level)) errors.parent = `A ${LEVEL_NOUN[plan.level]} can't sit under a ${LEVEL_NOUN[parent.level]}.`;
    else if (isArchived(plans, parent)) errors.parent = `“${planName(parent)}” is archived. Restore it first.`;
    else if (!errors.dates && overlapDays(parent.start, parent.end, plan.start, plan.end) === 0) {
      errors.parent = `These dates are outside “${planName(parent)}”.`;
    }
  }
  return errors;
}

export type ItemErrors = Partial<Record<"title" | "targetDate" | "goalMilestone", string>>;

export function validateItem(item: PlanItem): ItemErrors {
  const errors: ItemErrors = {};
  const t = item.title.trim();
  if (!t) errors.title = item.kind === "milestone" ? "Name the milestone." : "Name the activity.";
  else if (t.length > LIMITS.itemTitle) errors.title = `Keep it under ${LIMITS.itemTitle} characters.`;
  if (item.targetDate !== undefined && !isISODate(item.targetDate)) errors.targetDate = "Pick a valid date.";
  if (item.goalMilestoneId && !item.goalId) errors.goalMilestone = "Choose the goal first.";
  return errors;
}

/** True when an item's date falls outside its plan, so the view can say so. */
export function outsidePlan(item: PlanItem, plan: Pick<RoadmapPlan, "start" | "end">): boolean {
  return Boolean(item.targetDate && (item.targetDate < plan.start || item.targetDate > plan.end));
}

/* ── deleting ────────────────────────────────────────────────────── */

export type ChildPolicy = "keep" | "delete";

/**
 * Removes a plan. With `keep`, the plans under it move up to its own parent
 * when that parent can hold them, or stand alone; nothing else changes.
 * With `delete`, everything under it goes too. Carry-forward links that
 * pointed into removed plans are cleared, so nothing points at nothing.
 */
export function removePlan(plans: RoadmapPlan[], id: string, policy: ChildPolicy, stamp: string = now()): RoadmapPlan[] {
  const target = plans.find((p) => p.id === id);
  if (!target) return plans;
  const gone = new Set([id, ...(policy === "delete" ? descendantIds(plans, id) : [])]);
  const grand = target.parentId ? plans.find((p) => p.id === target.parentId) : undefined;
  return plans
    .filter((p) => !gone.has(p.id))
    .map((p) => {
      let next = p;
      if (p.parentId === id) {
        next = { ...p, updatedAt: stamp };
        if (grand && canParent(grand.level, p.level)) next.parentId = grand.id;
        else delete next.parentId;
      }
      if (next.items?.some((it) => (it.carriedTo && gone.has(it.carriedTo.planId)) || (it.carriedFrom && gone.has(it.carriedFrom.planId)))) {
        next = {
          ...next,
          updatedAt: stamp,
          items: next.items!.map((it) => {
            if (!(it.carriedTo && gone.has(it.carriedTo.planId)) && !(it.carriedFrom && gone.has(it.carriedFrom.planId))) return it;
            const clean = { ...it };
            if (clean.carriedTo && gone.has(clean.carriedTo.planId)) delete clean.carriedTo;
            if (clean.carriedFrom && gone.has(clean.carriedFrom.planId)) delete clean.carriedFrom;
            return clean;
          }),
        };
      }
      return next;
    });
}

/* ── activities ──────────────────────────────────────────────────── */

export function activitiesOf(plan: RoadmapPlan): PlanItem[] {
  return (plan.items ?? []).filter((i) => i.kind === "activity");
}

export function milestonesOf(plan: RoadmapPlan): PlanItem[] {
  return (plan.items ?? []).filter((i) => i.kind === "milestone");
}

/** Moves an item one place up or down among items of the same kind. */
export function moveItem(items: PlanItem[], id: string, delta: -1 | 1): PlanItem[] {
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return items;
  const kind = items[idx].kind;
  let j = idx + delta;
  while (j >= 0 && j < items.length && items[j].kind !== kind) j += delta;
  if (j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

/** Finds an item anywhere in the roadmap. */
export function findItem(plans: RoadmapPlan[], ref: PlanItemRef | undefined): { plan: RoadmapPlan; item: PlanItem } | null {
  if (!ref) return null;
  const plan = plans.find((p) => p.id === ref.planId);
  const item = plan?.items?.find((i) => i.id === ref.itemId);
  return plan && item ? { plan, item } : null;
}

/** Carried forward, and the copy still exists. */
export function isCarried(plans: RoadmapPlan[], item: PlanItem): boolean {
  return Boolean(item.carriedTo && findItem(plans, item.carriedTo));
}

/** Activities that could still move on to the next plan. */
export function carryable(plans: RoadmapPlan[], plan: RoadmapPlan): PlanItem[] {
  return activitiesOf(plan).filter((i) => i.status !== "completed" && !isCarried(plans, i));
}

/** The first day of the period after this one. */
export function nextPeriodStart(plan: RoadmapPlan): ISODate {
  if (plan.level === "week") return addDays(plan.start, 7);
  if (plan.level === "month") return monthStart(addMonths(monthKeyOf(plan.start), 1));
  return `${(plan.year ?? Number(plan.start.slice(0, 4))) + 1}-01-01`;
}

/** The plan of the same level for the period after this one, if there is one. */
export function nextPlanOf(plans: RoadmapPlan[], plan: RoadmapPlan): RoadmapPlan | undefined {
  if (plan.level === "year") {
    const y = (plan.year ?? Number(plan.start.slice(0, 4))) + 1;
    return plans.find((p) => p.level === "year" && p.year === y);
  }
  const start = nextPeriodStart(plan);
  return plans.find((p) => p.level === plan.level && p.start === start);
}

export function previousPlanOf(plans: RoadmapPlan[], plan: RoadmapPlan): RoadmapPlan | undefined {
  if (plan.level === "year") {
    const y = (plan.year ?? Number(plan.start.slice(0, 4))) - 1;
    return plans.find((p) => p.level === "year" && p.year === y);
  }
  const start = plan.level === "week" ? addDays(plan.start, -7) : monthStart(addMonths(monthKeyOf(plan.start), -1));
  return plans.find((p) => p.level === plan.level && p.start === start);
}

function clampDate(iso: ISODate, start: ISODate, end: ISODate): ISODate {
  return iso < start ? start : iso > end ? end : iso;
}

/**
 * Carries unfinished activities into another plan. Each gets a copy there,
 * marked as carried from here; the original stays where it was, marked
 * deferred and carried to the copy, so the history of what was planned
 * when is never rewritten. Target dates move by the gap between the two
 * plans. Carrying the same activity twice does nothing the second time.
 */
export function carryForward(
  plans: RoadmapPlan[],
  fromId: string,
  itemIds: string[],
  toId: string,
  stamp: string = now(),
): { plans: RoadmapPlan[]; moved: number } {
  const from = plans.find((p) => p.id === fromId);
  const to = plans.find((p) => p.id === toId);
  if (!from || !to || from.id === to.id) return { plans, moved: 0 };
  const wanted = new Set(itemIds);
  const offset = daysBetween(from.start, to.start);
  const copies: PlanItem[] = [];
  const links = new Map<string, PlanItemRef>();
  for (const it of from.items ?? []) {
    if (!wanted.has(it.id) || it.kind !== "activity" || it.status === "completed" || isCarried(plans, it)) continue;
    const copy: PlanItem = {
      id: uid("pa"),
      kind: "activity",
      title: it.title,
      status: it.status === "inProgress" ? "inProgress" : "notStarted",
      createdAt: stamp,
      carriedFrom: { planId: from.id, itemId: it.id },
    };
    for (const k of ["description", "priority", "subjectId", "category", "goalId", "goalMilestoneId", "notes"] as const) {
      if (it[k] !== undefined) (copy as unknown as Record<string, unknown>)[k] = it[k];
    }
    if (it.targetDate) copy.targetDate = clampDate(addDays(it.targetDate, offset), to.start, to.end);
    copies.push(copy);
    links.set(it.id, { planId: to.id, itemId: copy.id });
  }
  if (!copies.length) return { plans, moved: 0 };
  const next = plans.map((p) => {
    if (p.id === from.id) {
      return {
        ...p,
        updatedAt: stamp,
        items: (p.items ?? []).map((it) => {
          const ref = links.get(it.id);
          if (!ref) return it;
          const moved: PlanItem = { ...it, status: "deferred", carriedTo: ref };
          delete moved.completedAt;
          return moved;
        }),
      };
    }
    if (p.id === to.id) return { ...p, updatedAt: stamp, items: [...(p.items ?? []), ...copies] };
    return p;
  });
  return { plans: next, moved: copies.length };
}

/**
 * Takes back a carry forward: the copy in the other plan is removed and the
 * original is open here again. Only while the copy is untouched (not done,
 * no journal days, not carried on again); otherwise it says why not.
 */
export function undoCarry(
  plans: RoadmapPlan[],
  planId: string,
  itemId: string,
  stamp: string = now(),
): { plans: RoadmapPlan[]; ok: boolean; reason?: string } {
  const plan = plans.find((p) => p.id === planId);
  const original = plan?.items?.find((i) => i.id === itemId);
  if (!plan || !original?.carriedTo) return { plans, ok: false, reason: "This activity wasn't carried forward." };
  const copy = findItem(plans, original.carriedTo);
  if (copy && (copy.item.status === "completed" || copy.item.journalDates?.length || copy.item.carriedTo)) {
    return { plans, ok: false, reason: `It has been worked on in “${planName(copy.plan)}”, so it stays there.` };
  }
  const next = plans.map((p) => {
    if (copy && p.id === copy.plan.id && p.id !== planId) {
      return { ...p, updatedAt: stamp, items: (p.items ?? []).filter((i) => i.id !== copy.item.id) };
    }
    if (p.id !== planId) return p;
    return {
      ...p,
      updatedAt: stamp,
      items: (p.items ?? [])
        .filter((i) => !(copy && copy.plan.id === planId && i.id === copy.item.id))
        .map((i) => {
          if (i.id !== itemId) return i;
          const open: PlanItem = { ...i, status: copy?.item.status === "inProgress" ? "inProgress" : "notStarted" };
          delete open.carriedTo;
          return open;
        }),
    };
  });
  return { plans: next, ok: true };
}

/* ── duplicating ─────────────────────────────────────────────────── */

/**
 * A copy of a plan's own content for another period: focus, objectives,
 * outcomes, notes, linked goals and items. Every item gets a new id and
 * starts again as not started, with its date moved to the new period.
 * Reviews, journal links, archive state and plans under it aren't copied.
 */
export function duplicatePlan(
  plan: RoadmapPlan,
  target: { year?: number; month?: string; start?: ISODate; title?: string },
  stamp: string = now(),
): RoadmapPlan {
  const fresh = blankPlan(plan.level, target, stamp);
  let shift: (iso: ISODate) => ISODate;
  if (plan.level === "year") {
    const years = (fresh.year ?? 0) - (plan.year ?? Number(plan.start.slice(0, 4)));
    if (!isCalendarYear(plan)) {
      fresh.start = shiftYears(plan.start, years);
      fresh.end = shiftYears(plan.end, years);
    }
    shift = (iso) => shiftYears(iso, years);
  } else if (plan.level === "month") {
    const key = monthKeyOf(fresh.start);
    shift = (iso) => (monthKeyOf(iso) === monthKeyOf(plan.start) ? shiftToMonth(iso, key) : addDays(iso, daysBetween(plan.start, fresh.start)));
  } else {
    const offset = daysBetween(plan.start, fresh.start);
    shift = (iso) => addDays(iso, offset);
  }
  const copy: RoadmapPlan = { ...fresh };
  const title = target.title ?? plan.title;
  if (title?.trim()) copy.title = title.trim();
  if (plan.focus) copy.focus = plan.focus;
  if (plan.objectives?.length) copy.objectives = [...plan.objectives];
  if (plan.outcomes) copy.outcomes = plan.outcomes;
  if (plan.notes) copy.notes = plan.notes;
  if (plan.goalIds?.length) copy.goalIds = [...plan.goalIds];
  if (plan.items?.length) {
    copy.items = plan.items.map((it) => {
      const c: PlanItem = { id: uid(it.kind === "milestone" ? "pm" : "pa"), kind: it.kind, title: it.title, status: "notStarted", createdAt: stamp };
      for (const k of ["description", "priority", "subjectId", "category", "goalId", "goalMilestoneId", "notes"] as const) {
        if (it[k] !== undefined) (c as unknown as Record<string, unknown>)[k] = it[k];
      }
      if (it.targetDate) c.targetDate = shift(it.targetDate);
      return c;
    });
  }
  return copy;
}

/* ── progress ────────────────────────────────────────────────────── */

export interface ExecutionCounts {
  /** Activities counted. */
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  /** Deferred, including those carried forward. */
  deferred: number;
  /** Of the deferred, how many went on to another plan. */
  carried: number;
  /** Not completed or deferred, and past their date (or the plan's end). */
  overdue: number;
  /** Share of counted activities completed, 0–100. Null with none. */
  pct: number | null;
  milestones: number;
  milestonesDone: number;
  milestonesOverdue: number;
}

function emptyCounts(): ExecutionCounts {
  return {
    total: 0,
    completed: 0,
    inProgress: 0,
    notStarted: 0,
    deferred: 0,
    carried: 0,
    overdue: 0,
    pct: null,
    milestones: 0,
    milestonesDone: 0,
    milestonesOverdue: 0,
  };
}

/** Open, and its date (or its plan's last day) has gone by. */
export function isOverdue(item: PlanItem, plan: Pick<RoadmapPlan, "end">, today: ISODate): boolean {
  if (item.status === "completed" || item.status === "deferred") return false;
  return (item.targetDate ?? plan.end) < today;
}

function tally(out: ExecutionCounts, plans: RoadmapPlan[], plan: RoadmapPlan, item: PlanItem, today: ISODate) {
  if (item.kind === "milestone") {
    out.milestones++;
    if (item.status === "completed") out.milestonesDone++;
    else if (isOverdue(item, plan, today)) out.milestonesOverdue++;
    return;
  }
  out.total++;
  if (item.status === "completed") out.completed++;
  else if (item.status === "inProgress") out.inProgress++;
  else if (item.status === "deferred") {
    out.deferred++;
    if (isCarried(plans, item)) out.carried++;
  } else out.notStarted++;
  if (isOverdue(item, plan, today)) out.overdue++;
}

function finish(out: ExecutionCounts): ExecutionCounts {
  out.pct = out.total ? Math.round((out.completed / out.total) * 100) : null;
  return out;
}

/**
 * A plan's own activities and milestones. Everything planned here counts
 * here, including what was later carried forward: that was planned for this
 * period and not done in it.
 */
export function ownCounts(plans: RoadmapPlan[], plan: RoadmapPlan, today: ISODate): ExecutionCounts {
  const out = emptyCounts();
  for (const it of plan.items ?? []) tally(out, plans, plan, it, today);
  return finish(out);
}

/**
 * A plan with everything under it. Each piece of work is counted once: an
 * activity carried forward to a plan that is also part of this summary is
 * counted where it ended up, not twice.
 */
export function rollupCounts(plans: RoadmapPlan[], plan: RoadmapPlan, today: ISODate): ExecutionCounts & { plans: number } {
  const ids = new Set([plan.id, ...descendantIds(plans, plan.id)]);
  const out = emptyCounts();
  for (const p of plans) {
    if (!ids.has(p.id)) continue;
    for (const it of p.items ?? []) {
      const copy = it.carriedTo ? findItem(plans, it.carriedTo) : null;
      if (copy && ids.has(copy.plan.id)) continue;
      tally(out, plans, p, it, today);
    }
  }
  return { ...finish(out), plans: ids.size };
}

export type Timing = "upcoming" | "current" | "ended";

/** Where today sits relative to a plan, and how much of it has gone. */
export function timingOf(plan: Pick<RoadmapPlan, "start" | "end">, today: ISODate): { state: Timing; elapsedPct: number; daysLeft: number } {
  const total = daysBetween(plan.start, plan.end) + 1;
  if (today < plan.start) return { state: "upcoming", elapsedPct: 0, daysLeft: total };
  if (today > plan.end) return { state: "ended", elapsedPct: 100, daysLeft: 0 };
  const gone = daysBetween(plan.start, today) + 1;
  return { state: "current", elapsedPct: Math.round((gone / total) * 100), daysLeft: total - gone };
}

/* ── what's planned now, and what isn't ──────────────────────────── */

/** The plans covering today, at each level, ignoring archived ones. */
export function currentPlans(
  plans: RoadmapPlan[],
  today: ISODate,
): { year?: RoadmapPlan; month?: RoadmapPlan; week?: RoadmapPlan } {
  const live = activePlans(plans).filter((p) => p.start <= today && today <= p.end);
  const latest = (list: RoadmapPlan[]) => [...list].sort(byStart).pop();
  const week = latest(live.filter((p) => p.level === "week"));
  const month = latest(live.filter((p) => p.level === "month"));
  const years = live.filter((p) => p.level === "year");
  const year =
    years.find((y) => month && (month.parentId === y.id || ancestorsOf(plans, month).some((a) => a.id === y.id))) ??
    years.find((y) => y.year === Number(today.slice(0, 4))) ??
    latest(years);
  return { year, month, week };
}

/** A week slot is planned when a weekly plan covers most of it (four days or more). */
export function weekPlanFor(plans: RoadmapPlan[], slotStart: ISODate): RoadmapPlan | undefined {
  const slotEnd = weekEnd(slotStart);
  return plans
    .filter((p) => p.level === "week" && overlapDays(p.start, p.end, slotStart, slotEnd) >= 4)
    .sort((a, b) => Math.abs(daysBetween(a.start, slotStart)) - Math.abs(daysBetween(b.start, slotStart)))[0];
}

/**
 * Your own plan for the period a review covers, if you made one: a weekly
 * plan covering most of the week, the month's plan, or the year's.
 */
export function planForPeriod(plans: RoadmapPlan[], type: "Weekly" | "Monthly" | "Yearly", start: ISODate): RoadmapPlan | undefined {
  if (type === "Weekly") return weekPlanFor(plans, start);
  if (type === "Monthly") return plans.find((p) => p.level === "month" && monthKeyOf(p.start) === monthKeyOf(start));
  return plans.find((p) => p.level === "year" && p.year === Number(start.slice(0, 4)));
}

export interface WeekSlot {
  start: ISODate;
  end: ISODate;
  /** The month most of the week falls in. */
  home: string;
  plan?: RoadmapPlan;
}

/** The weeks touching a month, each with the weekly plan covering it, if any. */
export function weekSlots(plans: RoadmapPlan[], monthKey: string, weekStart = DEFAULT_WEEK_START): WeekSlot[] {
  return weeksOfMonth(monthKey, weekStart).map((start) => ({
    start,
    end: weekEnd(start),
    home: weekHomeMonth(start),
    plan: weekPlanFor(plans, start),
  }));
}

/** Months in a range with no monthly plan. */
export function unplannedMonths(plans: RoadmapPlan[], start: ISODate, end: ISODate): string[] {
  const planned = new Set(plans.filter((p) => p.level === "month").map((p) => monthKeyOf(p.start)));
  return monthsBetween(start, end).filter((k) => !planned.has(k));
}

/** Weeks that belong to a month (most of their days are in it) and have no weekly plan. */
export function unplannedWeeks(plans: RoadmapPlan[], monthKey: string, weekStart = DEFAULT_WEEK_START): ISODate[] {
  return weekSlots(plans, monthKey, weekStart)
    .filter((s) => s.home === monthKey && !s.plan)
    .map((s) => s.start);
}

export interface DatedItem {
  plan: RoadmapPlan;
  item: PlanItem;
  date: ISODate;
}

/** Milestones still to reach in the next `days` days, soonest first. */
export function upcomingMilestones(plans: RoadmapPlan[], today: ISODate, days = 60): DatedItem[] {
  const until = addDays(today, days);
  const out: DatedItem[] = [];
  for (const plan of activePlans(plans)) {
    for (const item of milestonesOf(plan)) {
      if (item.status === "completed" || item.status === "deferred" || !item.targetDate) continue;
      if (item.targetDate >= today && item.targetDate <= until) out.push({ plan, item, date: item.targetDate });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.item.title.localeCompare(b.item.title));
}

/** Open activities and milestones whose date has gone by, oldest first. */
export function overdueItems(plans: RoadmapPlan[], today: ISODate): DatedItem[] {
  const out: DatedItem[] = [];
  for (const plan of activePlans(plans)) {
    for (const item of plan.items ?? []) {
      if (isOverdue(item, plan, today)) out.push({ plan, item, date: item.targetDate ?? plan.end });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function recentlyUpdated(plans: RoadmapPlan[], n = 5): RoadmapPlan[] {
  return [...plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, n);
}

/* ── search ──────────────────────────────────────────────────────── */

export interface RoadmapFilters {
  level: PlanLevel | "all";
  year: number | "all";
  month: string | "all";
  /** Any date inside the week to look at. */
  week: ISODate | "";
  status: PlanItemStatus | "overdue" | "all";
  priority: PlanPriority | "all";
  goalId: string | "all";
  subjectId: string | "all";
  category: string | "all";
  includeArchived: boolean;
}

export const NO_FILTERS: RoadmapFilters = {
  level: "all",
  year: "all",
  month: "all",
  week: "",
  status: "all",
  priority: "all",
  goalId: "all",
  subjectId: "all",
  category: "all",
  includeArchived: false,
};

export interface SearchResults {
  plans: RoadmapPlan[];
  items: { plan: RoadmapPlan; item: PlanItem }[];
}

function hay(...parts: (string | undefined | string[])[]): string {
  return parts
    .flat()
    .filter(Boolean)
    .join(" \u0001 ")
    .toLowerCase();
}

function reviewText(r?: PlanReview): string[] {
  return r ? [r.wentWell ?? "", r.improve ?? "", r.nextPriorities ?? ""] : [];
}

/**
 * Plans and activities matching a query and filters. Date filters match the
 * period of the plan an activity belongs to. Filters that only make sense for
 * activities (status, priority, subject, category) leave plans out.
 */
export function searchRoadmap(plans: RoadmapPlan[], query: string, f: RoadmapFilters, today: ISODate): SearchResults {
  const q = query.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  const matches = (text: string) => terms.every((t) => text.includes(t));
  const pool = f.includeArchived ? plans : activePlans(plans);

  /* A range matches the date filters when it touches every chosen period. An
     activity with a date of its own is placed by that date; one without, by
     its plan's dates. */
  const touches = (start: ISODate, end: ISODate) => {
    if (f.year !== "all" && overlapDays(start, end, `${f.year}-01-01`, `${f.year}-12-31`) === 0) return false;
    if (f.month !== "all" && overlapDays(start, end, monthStart(f.month), monthEnd(f.month)) === 0) return false;
    if (f.week && overlapDays(start, end, f.week, addDays(f.week, 6)) === 0) return false;
    return true;
  };
  const levelOk = (p: RoadmapPlan) => f.level === "all" || p.level === f.level;
  const itemOnly = f.status !== "all" || f.priority !== "all" || f.subjectId !== "all" || f.category !== "all";

  const planHits = itemOnly
    ? []
    : pool.filter(
        (p) =>
          levelOk(p) &&
          touches(p.start, p.end) &&
          (f.goalId === "all" || (p.goalIds ?? []).includes(f.goalId)) &&
          (!terms.length || matches(hay(p.title, planName(p), periodLabel(p), p.focus, p.objectives ?? [], p.outcomes, p.notes, reviewText(p.review)))),
      );

  const itemHits: SearchResults["items"] = [];
  for (const p of pool) {
    if (!levelOk(p)) continue;
    for (const it of p.items ?? []) {
      if (it.targetDate ? !touches(it.targetDate, it.targetDate) : !touches(p.start, p.end)) continue;
      if (f.goalId !== "all" && it.goalId !== f.goalId) continue;
      if (f.priority !== "all" && (it.priority ?? "Medium") !== f.priority) continue;
      if (f.subjectId !== "all" && it.subjectId !== f.subjectId) continue;
      if (f.category !== "all" && (it.category ?? "").toLowerCase() !== f.category.toLowerCase()) continue;
      if (f.status === "overdue" ? !isOverdue(it, p, today) : f.status !== "all" && it.status !== f.status) continue;
      if (terms.length && !matches(hay(it.title, it.description, it.notes, it.category))) continue;
      itemHits.push({ plan: p, item: it });
    }
  }
  planHits.sort((a, b) => b.start.localeCompare(a.start));
  itemHits.sort((a, b) => (b.item.targetDate ?? b.plan.start).localeCompare(a.item.targetDate ?? a.plan.start));
  return { plans: planHits, items: itemHits };
}

/** Categories in use, for the filter. */
export function usedCategories(plans: RoadmapPlan[]): string[] {
  const seen = new Map<string, string>();
  for (const p of plans) for (const it of p.items ?? []) if (it.category?.trim()) seen.set(it.category.trim().toLowerCase(), it.category.trim());
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/* ── goals: references, never copies ─────────────────────────────── */

/** Where a goal appears in the roadmap. Read-only context for the Goals page. */
export function goalLinks(plans: RoadmapPlan[], goalId: string): { plans: RoadmapPlan[]; items: { plan: RoadmapPlan; item: PlanItem }[] } {
  const linked = plans.filter((p) => p.goalIds?.includes(goalId)).sort(byStart);
  const items: { plan: RoadmapPlan; item: PlanItem }[] = [];
  for (const p of plans) for (const it of p.items ?? []) if (it.goalId === goalId) items.push({ plan: p, item: it });
  items.sort((a, b) => (a.item.targetDate ?? a.plan.start).localeCompare(b.item.targetDate ?? b.plan.start));
  return { plans: linked, items };
}

/** The goals a plan names that still exist. A deleted goal's id is just ignored. */
export function linkedGoals(plan: RoadmapPlan, goals: Goal[]): Goal[] {
  const ids = new Set(plan.goalIds ?? []);
  return goals.filter((g) => ids.has(g.id));
}

/** Removes every reference to a goal (when the goal is deleted). Plans stay. */
export function stripGoal(plans: RoadmapPlan[], goalId: string, stamp: string = now()): RoadmapPlan[] {
  let changed = false;
  const next = plans.map((p) => {
    const inPlan = p.goalIds?.includes(goalId);
    const inItems = p.items?.some((it) => it.goalId === goalId);
    if (!inPlan && !inItems) return p;
    changed = true;
    const out: RoadmapPlan = { ...p, updatedAt: stamp };
    if (inPlan) {
      const ids = p.goalIds!.filter((g) => g !== goalId);
      if (ids.length) out.goalIds = ids;
      else delete out.goalIds;
    }
    if (inItems) {
      out.items = p.items!.map((it) => {
        if (it.goalId !== goalId) return it;
        const c = { ...it };
        delete c.goalId;
        delete c.goalMilestoneId;
        return c;
      });
    }
    return out;
  });
  return changed ? next : plans;
}

/* ── the journal: what actually happened ─────────────────────────── */

/** Activities someone linked to a journal day. */
export function itemsForJournalDay(plans: RoadmapPlan[], date: ISODate): { plan: RoadmapPlan; item: PlanItem }[] {
  const out: { plan: RoadmapPlan; item: PlanItem }[] = [];
  for (const p of plans) for (const it of p.items ?? []) if (it.journalDates?.includes(date)) out.push({ plan: p, item: it });
  return out;
}

/** Links (`on`) or unlinks a journal day. Neither the day nor the activity is touched otherwise. */
export function withJournalDate(item: PlanItem, date: ISODate, on: boolean): PlanItem {
  const set = new Set(item.journalDates ?? []);
  if (on) set.add(date);
  else set.delete(date);
  const next = { ...item };
  if (set.size) next.journalDates = [...set].sort();
  else delete next.journalDates;
  return next;
}

/** A journal day was deleted or moved: links to it go, or follow it. */
export function retargetJournalDate(plans: RoadmapPlan[], from: ISODate, to: ISODate | null, stamp: string = now()): RoadmapPlan[] {
  let changed = false;
  const next = plans.map((p) => {
    if (!p.items?.some((it) => it.journalDates?.includes(from))) return p;
    changed = true;
    return {
      ...p,
      updatedAt: stamp,
      items: p.items.map((it) => {
        if (!it.journalDates?.includes(from)) return it;
        const moved = withJournalDate(it, from, false);
        return to ? withJournalDate(moved, to, true) : moved;
      }),
    };
  });
  return changed ? next : plans;
}

/** A subject was deleted: activities keep everything but the subject. */
export function stripSubject(plans: RoadmapPlan[], subjectId: string, stamp: string = now()): RoadmapPlan[] {
  let changed = false;
  const next = plans.map((p) => {
    if (!p.items?.some((it) => it.subjectId === subjectId)) return p;
    changed = true;
    return {
      ...p,
      updatedAt: stamp,
      items: p.items.map((it) => {
        if (it.subjectId !== subjectId) return it;
        const c = { ...it };
        delete c.subjectId;
        return c;
      }),
    };
  });
  return changed ? next : plans;
}

export interface Recorded {
  /** Journal days in the range (up to today). */
  days: number;
  hours: number;
  topics: number;
  bySubject: Map<string, number>;
  entries: JournalEntry[];
}

/** What the journal recorded between two dates. Days still to come aren't counted. */
export function recordedBetween(journal: JournalEntry[], start: ISODate, end: ISODate, today: ISODate): Recorded {
  const last = end < today ? end : today;
  const entries = journal.filter((e) => e.date >= start && e.date <= last).sort((a, b) => a.date.localeCompare(b.date));
  const bySubject = new Map<string, number>();
  let topics = 0;
  for (const e of entries) {
    topics += countCompletedTopics(e);
    for (const b of e.blocks ?? []) {
      if (b?.subjectId && b.hours > 0) bySubject.set(b.subjectId, (bySubject.get(b.subjectId) ?? 0) + b.hours);
    }
  }
  return {
    days: entries.length,
    hours: round(entries.reduce((a, e) => a + (e.totalHours || 0), 0), 1),
    topics,
    bySubject,
    entries,
  };
}

export interface SubjectPlanVsRecord {
  subjectId: string;
  name: string;
  planned: number;
  done: number;
  hours: number;
}

/**
 * Planned work next to recorded hours, subject by subject, for a plan's dates.
 * Planned comes from the activities; recorded from the journal. Neither
 * changes the other.
 */
export function plannedVsRecorded(
  plan: RoadmapPlan,
  journal: JournalEntry[],
  subjects: Subject[],
  today: ISODate,
): { recorded: Recorded; rows: SubjectPlanVsRecord[] } {
  const recorded = recordedBetween(journal, plan.start, plan.end, today);
  const rows = new Map<string, SubjectPlanVsRecord>();
  const name = (id: string) => subjects.find((s) => s.id === id)?.name ?? "A removed subject";
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { subjectId: id, name: name(id), planned: 0, done: 0, hours: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const it of activitiesOf(plan)) {
    if (!it.subjectId) continue;
    const r = row(it.subjectId);
    r.planned++;
    if (it.status === "completed") r.done++;
  }
  for (const [id, h] of recorded.bySubject) row(id).hours = round(h, 1);
  return { recorded, rows: [...rows.values()].sort((a, b) => b.hours - a.hours || b.planned - a.planned) };
}

/** The days of a plan, for a day-by-day strip (a week has seven). */
export function daysOf(plan: Pick<RoadmapPlan, "start" | "end">, max = 7): ISODate[] {
  const out: ISODate[] = [];
  for (let d = plan.start; d <= plan.end && out.length < max; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ── tidying data from other devices, backups and older versions ──── */

const STATUS_SET = new Set<string>(ITEM_STATUSES);
const PRIORITY_SET = new Set<string>(PLAN_PRIORITIES);

/* Text is trimmed but never cut short here: the forms cap what can be typed,
   and tidying is no place to lose someone's words. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function ref(v: unknown): PlanItemRef | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  return typeof r.planId === "string" && r.planId && typeof r.itemId === "string" && r.itemId
    ? { planId: r.planId, itemId: r.itemId }
    : undefined;
}

/** A fresh id that can't clash, made the same way on every device. */
function uniqueId(base: string, taken: Set<string>): string {
  let n = 2;
  while (taken.has(`${base}~${n}`)) n++;
  return `${base}~${n}`;
}

function cleanItem(raw: unknown, fallbackStamp: string, taken: Set<string>): PlanItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  const id = taken.has(r.id) ? uniqueId(r.id, taken) : r.id;
  taken.add(id);
  const item: PlanItem = {
    id,
    kind: r.kind === "milestone" ? "milestone" : "activity",
    title: str(r.title) ?? "Untitled",
    status: typeof r.status === "string" && STATUS_SET.has(r.status) ? (r.status as PlanItemStatus) : "notStarted",
    createdAt: typeof r.createdAt === "string" && r.createdAt ? r.createdAt : fallbackStamp,
  };
  const description = str(r.description);
  if (description) item.description = description;
  if (typeof r.priority === "string" && PRIORITY_SET.has(r.priority)) item.priority = r.priority as PlanPriority;
  if (isISODate(r.targetDate)) item.targetDate = r.targetDate;
  const subjectId = str(r.subjectId);
  if (subjectId) item.subjectId = subjectId;
  const category = str(r.category);
  if (category) item.category = category;
  const goalId = str(r.goalId);
  if (goalId) {
    item.goalId = goalId;
    const gm = str(r.goalMilestoneId);
    if (gm) item.goalMilestoneId = gm;
  }
  const notes = str(r.notes);
  if (notes) item.notes = notes;
  if (item.status === "completed" && typeof r.completedAt === "string" && r.completedAt) item.completedAt = r.completedAt;
  if (Array.isArray(r.journalDates)) {
    const dates = [...new Set(r.journalDates.filter(isISODate))].sort();
    if (dates.length) item.journalDates = dates;
  }
  const from = ref(r.carriedFrom);
  if (from) item.carriedFrom = from;
  const to = ref(r.carriedTo);
  if (to) item.carriedTo = to;
  return item;
}

function cleanPlan(raw: unknown, takenPlans: Set<string>): RoadmapPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (r.level !== "year" && r.level !== "month" && r.level !== "week") return null;
  const level = r.level as PlanLevel;
  let start: ISODate | undefined = isISODate(r.start) ? r.start : undefined;
  let end: ISODate | undefined = isISODate(r.end) ? r.end : undefined;
  let year: number | undefined;

  if (level === "year") {
    const y = typeof r.year === "number" && Number.isInteger(r.year) && r.year >= 2000 && r.year <= 2100 ? r.year : start ? Number(start.slice(0, 4)) : undefined;
    if (y == null) return null;
    year = y;
    const ok = start && end && start <= end && daysBetween(start, end) + 1 <= LIMITS.yearSpanDays;
    if (!ok) ({ start, end } = yearRange(y));
  } else if (level === "month") {
    if (!start) return null;
    const key = monthKeyOf(start);
    start = monthStart(key);
    end = monthEnd(key);
  } else {
    if (!start) return null;
    end = weekEnd(start);
  }

  const id = takenPlans.has(r.id) ? uniqueId(r.id, takenPlans) : r.id;
  takenPlans.add(id);
  const fallbackStamp = `${start}T00:00:00.000Z`;
  const plan: RoadmapPlan = {
    id,
    level,
    ...(year != null ? { year } : {}),
    start: start as ISODate,
    end: end as ISODate,
    createdAt: typeof r.createdAt === "string" && r.createdAt ? r.createdAt : fallbackStamp,
    updatedAt: typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : typeof r.createdAt === "string" && r.createdAt ? r.createdAt : fallbackStamp,
  };
  const title = str(r.title);
  if (title) plan.title = title;
  const parentId = str(r.parentId);
  if (parentId) plan.parentId = parentId;
  for (const k of ["focus", "outcomes", "notes"] as const) {
    const v = str(r[k]);
    if (v) plan[k] = v;
  }
  if (Array.isArray(r.objectives)) {
    const list = r.objectives.map(str).filter((o): o is string => o !== undefined);
    if (list.length) plan.objectives = list;
  }
  if (Array.isArray(r.goalIds)) {
    const ids = [...new Set(r.goalIds.filter((g): g is string => typeof g === "string" && g !== ""))].sort();
    if (ids.length) plan.goalIds = ids;
  }
  if (Array.isArray(r.items)) {
    const taken = new Set<string>();
    const items = r.items.map((it) => cleanItem(it, plan.createdAt, taken)).filter((it): it is PlanItem => it !== null);
    if (items.length) plan.items = items;
  }
  if (r.review && typeof r.review === "object") {
    const rv = r.review as Record<string, unknown>;
    const review: PlanReview = {};
    for (const k of ["wentWell", "improve", "nextPriorities"] as const) {
      const v = str(rv[k]);
      if (v) review[k] = v;
    }
    if (typeof rv.reviewedAt === "string" && rv.reviewedAt) review.reviewedAt = rv.reviewedAt;
    if (Object.keys(review).length) plan.review = review;
  }
  if (typeof r.archivedAt === "string" && r.archivedAt) plan.archivedAt = r.archivedAt;
  return plan;
}

/**
 * One plan in its stored shape: text trimmed, empty fields left out, dates
 * consistent with the level, linked goals sorted. Its parent link is kept as
 * given (only `normalizePlans`, which sees every plan, can check it).
 */
export function tidyPlan(plan: RoadmapPlan): RoadmapPlan {
  return cleanPlan(plan, new Set()) ?? plan;
}

/** One item in its stored shape. */
export function tidyItem(item: PlanItem): PlanItem {
  return cleanItem(item, item.createdAt || now(), new Set()) ?? item;
}

/** Removes an item. Carry-forward links to it, from either side, go with it. */
export function removeItem(plans: RoadmapPlan[], planId: string, itemId: string, stamp: string = now()): RoadmapPlan[] {
  const points = (r?: PlanItemRef) => r?.planId === planId && r.itemId === itemId;
  return plans.map((p) => {
    const here = p.id === planId;
    if (!here && !p.items?.some((it) => points(it.carriedTo) || points(it.carriedFrom))) return p;
    return {
      ...p,
      updatedAt: stamp,
      items: (p.items ?? [])
        .filter((it) => !(here && it.id === itemId))
        .map((it) => {
          if (!points(it.carriedTo) && !points(it.carriedFrom)) return it;
          const c = { ...it };
          if (points(c.carriedTo)) delete c.carriedTo;
          if (points(c.carriedFrom)) delete c.carriedFrom;
          return c;
        }),
    };
  });
}

/**
 * Plans as this version expects them, from anywhere: the cloud, another
 * device on another version, a backup file. Broken records are dropped,
 * dates are made consistent with the level (a week is always seven days),
 * duplicate ids are renamed the same way on every device, and a parent link
 * that can't hold is removed rather than guessed at. Idempotent.
 */
export function normalizePlans(raw: unknown): RoadmapPlan[] {
  if (!Array.isArray(raw)) return [];
  const taken = new Set<string>();
  const plans = raw.map((p) => cleanPlan(p, taken)).filter((p): p is RoadmapPlan => p !== null);
  const map = plansById(plans);
  for (const p of plans) {
    if (!p.parentId) continue;
    const parent = map.get(p.parentId);
    if (!parent || !canParent(parent.level, p.level)) delete p.parentId;
  }
  return plans;
}
