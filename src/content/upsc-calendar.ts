import { OFFICIAL_PRELIMS_DATES } from "@/lib/seed";

/**
 * Civil Services Examination 2027 dates, from UPSC's Examination Calendar 2027
 * (released on upsc.gov.in on 20 May 2026). UPSC can revise its calendar, so
 * every page that shows these dates says so and links to the source.
 *
 * When UPSC changes a date or publishes the next calendar, update this file
 * (and OFFICIAL_PRELIMS_DATES in lib/seed.ts, which new accounts use), then
 * bump `updated` on the pages that show it in lib/seo/pages.ts.
 */
export const CSE_2027 = {
  notification: "2027-01-13",
  applicationsClose: "2027-02-02",
  prelims: OFFICIAL_PRELIMS_DATES[2027],
  mainsStart: "2027-08-20",
  mainsDays: 5,
  source: {
    label: "UPSC Examination Calendar 2027",
    url: "https://upsc.gov.in/examinations/exam-calendar",
    released: "2026-05-20",
  },
  /** When these dates were last checked against the source. */
  checked: "2026-11-17",
} as const;

/** Today's date in India (yyyy-mm-dd), whatever the server's own time zone. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

/** Whole days from one yyyy-mm-dd date to another. */
export function daysUntil(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** "23 May 2027" */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** "Sunday, 23 May 2027" */
export function longDateWithDay(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
