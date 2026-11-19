import type { ISODate, Review, ReviewType } from "./types";
import { fromISODate, toISODate } from "./utils";

/* ════════════════════════════════════════════════════════════════
   Review periods, for the "review not written" reminder.

   The Performance Review itself (its periods, figures and summary) lives
   in lib/performance.ts. This keeps the calendar periods the reminder asks
   about, Monday weeks and calendar months, which are the same periods the
   Performance Review offers, so a review written there satisfies it.
   ════════════════════════════════════════════════════════════════ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface PeriodWindow {
  type: ReviewType;
  /** Stable key for matching an existing review to this period. */
  key: string;
  periodLabel: string;
  startDate: ISODate;
  endDate: ISODate;
}

function shift(iso: ISODate, delta: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

/** Monday of the week containing `iso`. */
function weekStart(iso: ISODate): ISODate {
  const d = fromISODate(iso);
  return shift(iso, -((d.getDay() + 6) % 7));
}

function label(type: ReviewType, start: ISODate, end: ISODate): string {
  const s = fromISODate(start);
  const e = fromISODate(end);
  if (type === "Weekly") {
    const span =
      s.getMonth() === e.getMonth()
        ? `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]}`
        : `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
    return span;
  }
  if (type === "Monthly") return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  return String(s.getFullYear());
}

/**
 * The most recent `count` periods of a given type, newest first. The current,
 * still-running period is included — reviewing a week on its last day is normal.
 */
export function reviewPeriods(
  type: ReviewType,
  today: ISODate,
  count = 8,
): PeriodWindow[] {
  const out: PeriodWindow[] = [];
  const t = fromISODate(today);

  for (let i = 0; i < count; i++) {
    let startDate: ISODate;
    let endDate: ISODate;
    if (type === "Weekly") {
      startDate = shift(weekStart(today), -7 * i);
      endDate = shift(startDate, 6);
    } else if (type === "Monthly") {
      const first = new Date(t.getFullYear(), t.getMonth() - i, 1);
      startDate = toISODate(first);
      endDate = toISODate(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    } else {
      const y = t.getFullYear() - i;
      startDate = toISODate(new Date(y, 0, 1));
      endDate = toISODate(new Date(y, 11, 31));
    }
    out.push({
      type,
      key: `${type}:${startDate}`,
      periodLabel: label(type, startDate, endDate),
      startDate,
      endDate,
    });
  }
  return out;
}

/** Existing review for a period, if one has already been written. */
export function findReviewFor(reviews: Review[], w: PeriodWindow): Review | undefined {
  return reviews.find((r) => r.type === w.type && r.startDate === w.startDate);
}
