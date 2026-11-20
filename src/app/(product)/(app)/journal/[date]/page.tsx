import { notFound } from "next/navigation";
import { JournalDayView } from "./day-view";

/**
 * One day of the journal.
 *
 * Every day's page is the same shell, filled in from the data on this device,
 * so each one is built the first time any account opens that date and served
 * as a static page from then on: from the cache, at once, for every later
 * visit and prefetch. It used to be rendered by the server on every one of
 * them, and a quiet server took the best part of a second (more from far
 * away) to start. Dates can't all be built ahead of time, so none are.
 *
 * Anything that isn't a real day (YYYY-MM-DD, as the app writes them) is a
 * 404, so made-up addresses can't fill the cache with pages.
 */
export const dynamicParams = true;

export function generateStaticParams(): { date: string }[] {
  return [];
}

/** A real day, as the app writes them (YYYY-MM-DD), between 2000 and 2100. */
function isJournalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  const year = d.getUTCFullYear();
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && year >= 2000 && year <= 2100;
}

export default function Page({ params }: { params: { date: string } }) {
  // Anything else would be built and kept like a real day.
  if (!isJournalDate(params.date)) notFound();
  return <JournalDayView />;
}
