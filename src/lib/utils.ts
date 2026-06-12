import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ISO date (yyyy-mm-dd) for a Date. */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse an ISO date string into a local Date (no TZ drift). */
export function fromISODate(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

/** Days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = fromISODate(b).getTime() - fromISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Human friendly "12 Jun 2026". */
export function formatDate(iso: string): string {
  return fromISODate(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "Mon", "Tue"... */
export function weekday(iso: string): string {
  return fromISODate(iso).toLocaleDateString("en-US", { weekday: "short" });
}

/** Relative phrasing like "Today", "Yesterday", "3 days ago". */
export function relativeDay(iso: string, today: string): string {
  const diff = daysBetween(iso, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  if (diff < 0) return formatDate(iso);
  return formatDate(iso);
}

/** Clamp a number between min and max. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Round to a given number of decimals. */
export function round(n: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Format hours like 6.5 -> "6h 30m". */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Compact number formatter (1.2k). */
export function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(n);
}

/** Pseudo-random but deterministic id. */
export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Average of a list, 0 if empty. */
export function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Sum of a list. */
export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
