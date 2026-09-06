/* ════════════════════════════════════════════════════════════════
   WALL-CLOCK TIME IN SOMEONE ELSE'S TIMEZONE
   Pure, no dependencies. Used by the push dispatcher, which runs on a
   server in UTC but has to make decisions in the user's local day.
   ════════════════════════════════════════════════════════════════ */

/**
 * Whether the runtime recognises `tz` as an IANA zone.
 *
 * Worth checking rather than trusting: the value arrives from a browser and is
 * stored in a database, so it can be stale, spoofed, or from a runtime with a
 * different tz database. `Intl` throws a RangeError on anything it doesn't know.
 */
export function isValidTimeZone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * A `Date` whose **local getters** read as the wall clock in `timeZone`.
 *
 * The notification engine is written against local getters — `toISODate` uses
 * `getFullYear/getMonth/getDate`, and the hour-gated rules use `getHours`. That
 * is exactly right in a browser, where "local" is the user. On a server it is
 * exactly wrong: everything would be judged in UTC, so an Indian user's quiet
 * hours would start at 03:30 their time and "today" would flip mid-afternoon.
 *
 * Rather than rewrite every rule to take a zone, this shifts the instant so the
 * component getters already tell the truth. The returned Date does **not**
 * represent the same instant — it is a carrier for the user's calendar fields,
 * and should only ever be handed to the engine, never stored or serialised.
 *
 * Falls back to `at` unchanged when the zone is unusable, which degrades to
 * server-local rather than throwing mid-dispatch.
 */
export function zonedNow(timeZone: string | null | undefined, at: Date = new Date()): Date {
  if (!isValidTimeZone(timeZone)) return at;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone as string,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // h23 rather than `hour12: false`: the latter renders midnight as "24" in
    // some runtimes, which would roll the date forward by a day.
    hourCycle: "h23",
  }).formatToParts(at);

  const f: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") f[part.type] = part.value;
  }

  return new Date(
    Number(f.year),
    Number(f.month) - 1,
    Number(f.day),
    Number(f.hour),
    Number(f.minute),
    Number(f.second),
  );
}

/**
 * The user's calendar day and hour for a given instant — the two things every
 * scheduling decision in the engine actually turns on.
 */
export function zonedDayAndHour(
  timeZone: string | null | undefined,
  at: Date = new Date(),
): { date: string; hour: number } {
  const local = zonedNow(timeZone, at);
  const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(
    local.getDate(),
  ).padStart(2, "0")}`;
  return { date, hour: local.getHours() };
}

/**
 * The zone to use for a user, given the zones their devices reported.
 *
 * A user can have several subscriptions and they may disagree — a laptop taken
 * abroad, or a stale row from a previous city. The most common one wins, and ties
 * break alphabetically so the choice is stable rather than dependent on row
 * order. Unrecognised zones are discarded first.
 */
export function pickTimeZone(zones: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const z of zones) {
    if (!isValidTimeZone(z)) continue;
    const key = z as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];
}
