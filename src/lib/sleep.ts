import type { ISODate, LifeEntry, Profile, SleepTarget, TimeFormat } from "./types";
import { fromISODate, round, toISODate } from "./utils";

/* ════════════════════════════════════════════════════════════════
   SLEEP, AS PURE FUNCTIONS

   A night is stored on the Life Dashboard day you woke up on
   (`LifeEntry.date`), with bedtime and wake-up as wall-clock "HH:MM" in
   your local time. That meaning is unchanged; what this module adds is
   working out everything else from it reliably:

   - The day the bedtime falls on is never asked for. For any night
     shorter than a day it has exactly one answer: a bedtime later on the
     clock than the wake-up was the evening before; an earlier one (00:30,
     or a 14:00 nap) was the same day.
   - Durations come from real local dates, so a night across a clock
     change counts the hours that actually passed.
   - Times stay wall-clock rather than moments in UTC, so 23:00 is still
     23:00 on a phone set to another time zone.
   - Nothing is invented. A night without both times has no duration
     unless hours were entered, and a stored night of more than
     `MAX_SLEEP_HOURS` is left out of averages, not rewritten.
   ════════════════════════════════════════════════════════════════ */

/** Longer than this can't be a night's sleep: refused when saving, left out of averages. */
export const MAX_SLEEP_HOURS = 18;
/** Longer than this is possible but unusual: saving asks you to check the times. */
export const LONG_SLEEP_HOURS = 13;
/** Shorter than this is possible (a nap, a bad night) but worth a second look. */
export const SHORT_SLEEP_HOURS = 2;

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isClock(v: unknown): v is string {
  return typeof v === "string" && CLOCK.test(v);
}

/** Minutes after midnight, or null. */
export function clockMinutes(hhmm: string | undefined | null): number | null {
  if (!isClock(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "HH:MM" for a count of minutes, wrapped into one day. */
export function toClock(minutes: number): string {
  const v = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

export function shiftClock(hhmm: string, delta: number): string {
  return toClock((clockMinutes(hhmm) ?? 0) + delta);
}

function shiftDay(iso: ISODate, delta: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

function at(iso: ISODate, hhmm: string): Date {
  const d = fromISODate(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

/* ── one night ───────────────────────────────────────────────── */

/** The day the bedtime falls on, for a night that ended on `date` at `wakeTime`. */
export function bedDateFor(date: ISODate, bedtime: string, wakeTime: string): ISODate {
  const bed = clockMinutes(bedtime) ?? 0;
  const wake = clockMinutes(wakeTime) ?? 0;
  return bed >= wake ? shiftDay(date, -1) : date;
}

/** Minutes between bedtime and wake-up, from real local dates. Null without both. */
export function sleepMinutes(date: ISODate, bedtime: string | undefined, wakeTime: string | undefined): number | null {
  // The same time twice is no night at all, not a 24-hour one.
  if (!isClock(bedtime) || !isClock(wakeTime) || bedtime === wakeTime) return null;
  const bed = at(bedDateFor(date, bedtime, wakeTime), bedtime);
  const wake = at(date, wakeTime);
  const mins = Math.round((wake.getTime() - bed.getTime()) / 60_000);
  return mins > 0 ? mins : null;
}

export type SleepCheck =
  | { ok: false; reason: "missing" | "same" | "too-long"; minutes: number | null; message: string }
  | { ok: true; minutes: number; level: "ok" | "short" | "long"; message?: string };

/** Whether a bedtime and wake-up make a night that can be saved, and anything worth a second look. */
export function checkSleep(date: ISODate, bedtime: string | undefined, wakeTime: string | undefined): SleepCheck {
  if (!isClock(bedtime) || !isClock(wakeTime)) {
    return { ok: false, reason: "missing", minutes: null, message: "Set both times to see how long you slept." };
  }
  if (bedtime === wakeTime) {
    return { ok: false, reason: "same", minutes: null, message: "Bedtime and wake-up can't be the same time." };
  }
  const minutes = sleepMinutes(date, bedtime, wakeTime) as number;
  if (minutes > MAX_SLEEP_HOURS * 60) {
    return {
      ok: false,
      reason: "too-long",
      minutes,
      message: `That's ${formatDuration(minutes)}, over ${MAX_SLEEP_HOURS} hours. Check the times: AM and PM may be swapped.`,
    };
  }
  if (minutes < SHORT_SLEEP_HOURS * 60) {
    return { ok: true, minutes, level: "short", message: `Under ${SHORT_SLEEP_HOURS} hours. Check the times if this was a full night.` };
  }
  if (minutes > LONG_SLEEP_HOURS * 60) {
    return { ok: true, minutes, level: "long", message: `Over ${LONG_SLEEP_HOURS} hours. Check the times if that's not right.` };
  }
  return { ok: true, minutes, level: "ok" };
}

/** Hours a stored day counts as sleep in averages: missing and impossible values aren't counted. */
export function countedSleepHours(e: Pick<LifeEntry, "sleepHours"> | undefined): number | undefined {
  const h = e?.sleepHours;
  return typeof h === "number" && Number.isFinite(h) && h > 0 && h <= MAX_SLEEP_HOURS ? h : undefined;
}

export function hasSleep(e: LifeEntry | undefined): boolean {
  if (!e) return false;
  return Boolean(e.bedtime || e.wakeTime) || typeof e.sleepHours === "number" || typeof e.sleepQuality === "number";
}

export interface SleepNight {
  /** The day you woke up on: the record's date. */
  date: ISODate;
  /** The day the bedtime fell on, when both times are known. */
  bedDate?: ISODate;
  bedtime?: string;
  wakeTime?: string;
  /** Hours as stored. */
  hours?: number;
  /** Minutes between the two times, when both are set. */
  timesMinutes: number | null;
  /** Hours were entered by hand and differ from the times (time asleep vs time in bed). */
  manualHours: boolean;
  quality?: number;
  /** Bedtime recorded, wake-up not yet. */
  pending: boolean;
  /** Stored hours over the limit: shown, flagged, never averaged. */
  implausible: boolean;
}

/** One stored day's sleep, or null when it records none. */
export function nightOf(e: LifeEntry): SleepNight | null {
  if (!hasSleep(e)) return null;
  const bedtime = isClock(e.bedtime) ? e.bedtime : undefined;
  const wakeTime = isClock(e.wakeTime) ? e.wakeTime : undefined;
  const timesMinutes = sleepMinutes(e.date, bedtime, wakeTime);
  const hours = typeof e.sleepHours === "number" && Number.isFinite(e.sleepHours) ? e.sleepHours : undefined;
  return {
    date: e.date,
    bedDate: bedtime && wakeTime ? bedDateFor(e.date, bedtime, wakeTime) : undefined,
    bedtime,
    wakeTime,
    hours,
    timesMinutes,
    manualHours: hours != null && timesMinutes != null && Math.abs(hours * 60 - timesMinutes) > 2,
    quality: typeof e.sleepQuality === "number" ? e.sleepQuality : undefined,
    pending: Boolean(bedtime && !wakeTime && hours == null),
    implausible: hours != null && hours > MAX_SLEEP_HOURS,
  };
}

/** Every recorded night, newest first. */
export function sleepNights(lifeLog: LifeEntry[]): SleepNight[] {
  return lifeLog
    .map(nightOf)
    .filter((n): n is SleepNight => n !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The hours stored for a night once it is saved: from the times, unless entered by hand. */
export function hoursFromTimes(date: ISODate, bedtime?: string, wakeTime?: string): number | undefined {
  const m = sleepMinutes(date, bedtime, wakeTime);
  return m == null ? undefined : round(m / 60, 2);
}

/* ── many nights ─────────────────────────────────────────────── */

/**
 * Average of clock times on a 24-hour circle, so 23:30 and 00:30 average to
 * midnight rather than to noon. Null when there are none.
 */
export function meanClock(times: (string | undefined)[]): string | null {
  const mins = times.map((t) => clockMinutes(t)).filter((m): m is number => m != null);
  if (!mins.length) return null;
  let x = 0;
  let y = 0;
  for (const m of mins) {
    const a = (m / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  if (Math.hypot(x, y) < 1e-9) return null;
  let a = Math.atan2(y, x);
  if (a < 0) a += 2 * Math.PI;
  return toClock((a / (2 * Math.PI)) * 1440);
}

export interface SleepStats {
  /** Days in the window, ending today. */
  days: number;
  /** Nights in the window with hours that count. */
  nights: number;
  avgHours: number | null;
  avgBedtime: string | null;
  avgWake: string | null;
  /** Nights in the window over the limit, left out of the average. */
  excluded: number;
}

/** Averages over the last `days` days. Only recorded nights count; a missing one is not a night of 0. */
export function sleepStats(lifeLog: LifeEntry[], today: ISODate, days: number): SleepStats {
  const from = shiftDay(today, -(days - 1));
  const rows = lifeLog.filter((e) => e.date >= from && e.date <= today);
  const hours = rows.map((e) => countedSleepHours(e)).filter((h): h is number => h != null);
  return {
    days,
    nights: hours.length,
    avgHours: hours.length ? round(hours.reduce((a, b) => a + b, 0) / hours.length, 2) : null,
    avgBedtime: meanClock(rows.map((e) => e.bedtime)),
    avgWake: meanClock(rows.map((e) => e.wakeTime)),
    excluded: rows.filter((e) => typeof e.sleepHours === "number" && e.sleepHours > MAX_SLEEP_HOURS).length,
  };
}

/**
 * Your usual bedtime or wake-up over the last 14 recorded nights, rounded to
 * five minutes, offered as a one-tap suggestion. Needs at least three nights,
 * so it really is "usual".
 */
export function usualClock(lifeLog: LifeEntry[], field: "bedtime" | "wakeTime", before?: ISODate): string | null {
  const recent = sleepNights(lifeLog)
    .filter((n) => (!before || n.date < before) && n[field])
    .slice(0, 14)
    .map((n) => n[field]);
  if (recent.length < 3) return null;
  const mean = meanClock(recent);
  return mean ? toClock(Math.round((clockMinutes(mean) as number) / 5) * 5) : null;
}

/* ── the moments around a night ─────────────────────────────── */

/**
 * Which night "going to bed now" belongs to: from 6 PM, tonight's (it ends
 * tomorrow); before 4 AM, the one ending later today. Between those hours
 * it's ambiguous (a nap, or an early start?), so the quick action isn't
 * offered and the times are picked by hand.
 */
export function bedtimeNowNight(now: Date): ISODate | null {
  const h = now.getHours();
  if (h >= 18) {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return toISODate(t);
  }
  if (h < 4) return toISODate(now);
  return null;
}

export function clockNow(now: Date = new Date()): string {
  return toClock(now.getHours() * 60 + now.getMinutes());
}

/**
 * When the morning check-in starts asking about the night: two hours before
 * your usual wake-up, kept between 03:00 and 07:00. It used to be 07:00 for
 * everyone, so anyone up earlier wasn't asked until mid-morning.
 */
export function promptStartMinutes(lifeLog: LifeEntry[]): number {
  const usual = usualClock(lifeLog, "wakeTime");
  if (!usual) return 7 * 60;
  const m = (clockMinutes(usual) as number) - 120;
  return Math.min(7 * 60, Math.max(3 * 60, m));
}

/** The day the morning check-in is for at `now`: it only moves on at `startMinutes` past midnight. */
export function sleepPromptKey(now: Date, startMinutes: number): ISODate {
  const d = new Date(now.getTime());
  d.setMinutes(d.getMinutes() - startMinutes);
  return toISODate(d);
}

/* ── targets ─────────────────────────────────────────────────── */

/** Minutes the target schedule allows for sleep, or null without both times. */
export function targetMinutes(target: SleepTarget | undefined): number | null {
  if (!target || !isClock(target.bedtime) || !isClock(target.wakeTime) || target.bedtime === target.wakeTime) return null;
  const bed = clockMinutes(target.bedtime) as number;
  const wake = clockMinutes(target.wakeTime) as number;
  return wake > bed ? wake - bed : wake + 1440 - bed;
}

/** Signed minutes from `target` to `actual` on the clock, the short way round (+ later, − earlier). */
export function clockDelta(actual: string, target: string): number {
  const d = ((clockMinutes(actual) as number) - (clockMinutes(target) as number) + 1440) % 1440;
  return d > 720 ? d - 1440 : d;
}

/* ── showing and typing times ────────────────────────────────── */

/** The device's convention, from its locale. */
export function deviceTimeFormat(locale?: string): TimeFormat {
  try {
    const cycle = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
    return cycle === "h11" || cycle === "h12" ? "12h" : "24h";
  } catch {
    return "12h";
  }
}

export function timeFormatOf(profile: Pick<Profile, "timeFormat"> | undefined): TimeFormat {
  return profile?.timeFormat ?? deviceTimeFormat();
}

/** "11:05 PM" or "23:05". */
export function formatClock(hhmm: string | undefined | null, format: TimeFormat): string {
  const { main, suffix } = clockParts(hhmm, format);
  return suffix ? `${main} ${suffix}` : main;
}

/** The time and its AM/PM apart, for setting the suffix smaller. */
export function clockParts(hhmm: string | undefined | null, format: TimeFormat): { main: string; suffix: string } {
  const m = clockMinutes(hhmm);
  if (m == null) return { main: "--:--", suffix: "" };
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  if (format === "24h") return { main: `${String(h).padStart(2, "0")}:${mm}`, suffix: "" };
  return { main: `${h % 12 === 0 ? 12 : h % 12}:${mm}`, suffix: h < 12 ? "AM" : "PM" };
}

/** "7h 30m", "45m", "8h". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * A typed time, read the way people write them: "23:30", "2330", "11:30 pm",
 * "11.30p", "7", "7am", "12a". Without AM/PM on a 12-hour clock, the field
 * decides: a bedtime of "11" is 23:00 and "1" is 01:00; a wake-up of "7" is
 * 07:00. Null when it can't be read.
 */
export function parseClock(input: string, opts: { format?: TimeFormat; context?: "bed" | "wake" } = {}): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = /^(\d{1,4})(?:[:.h](\d{1,2}))?(a|am|p|pm|a\.m\.|p\.m\.)?$/.exec(s);
  if (!m) return null;
  let hour: number;
  let minute: number;
  if (m[2] !== undefined) {
    hour = Number(m[1]);
    minute = Number(m[2]);
    if (m[1].length > 2) return null;
  } else if (m[1].length <= 2) {
    hour = Number(m[1]);
    minute = 0;
  } else {
    hour = Number(m[1].slice(0, -2));
    minute = Number(m[1].slice(-2));
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  const meridiem = m[3]?.startsWith("a") ? "am" : m[3]?.startsWith("p") ? "pm" : null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === "pm" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  } else if ((opts.format ?? "12h") === "12h" && hour >= 1 && hour <= 12 && !m[1].startsWith("0")) {
    if (opts.context === "bed") hour = hour === 12 ? 0 : hour <= 5 ? hour : hour + 12;
    else if (opts.context === "wake") hour = hour === 12 ? 12 : hour;
  }
  return toClock(hour * 60 + minute);
}

/** "Sun 16 – Mon 17 Nov" for the night ending on `date`. (No arrow: the text face has none.) */
export function nightLabel(date: ISODate): string {
  const end = fromISODate(date);
  const start = fromISODate(shiftDay(date, -1));
  const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
  const month = end.toLocaleDateString("en-GB", { month: "short" });
  const startMonth = start.toLocaleDateString("en-GB", { month: "short" });
  return startMonth === month ? `${day(start)} – ${day(end)} ${month}` : `${day(start)} ${startMonth} – ${day(end)} ${month}`;
}

/** "Sun 16 Nov". */
export function shortDay(date: ISODate): string {
  return fromISODate(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
