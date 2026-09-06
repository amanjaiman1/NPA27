import type { ISODate, Reflection } from "./types";
import { fromISODate, toISODate, round, avg } from "./utils";

/* ════════════════════════════════════════════════════════════════
   The reflection journal, read as a whole rather than card by card.

   A pile of private entries is worth more when you can see the shape of
   it — whether the writing is a habit, which way the mood is drifting,
   and what keeps coming up as something to be grateful for.
   ════════════════════════════════════════════════════════════════ */

export const MOOD_WORDS = ["", "Heavy", "Low", "Even", "Light", "Soaring"];

/**
 * Prompts, grouped by what they're for. Grouping matters more than the count:
 * "what am I avoiding" and "what am I grateful for" are different tools, and
 * picking blindly from one flat list buries that.
 */
export const PROMPT_GROUPS: { group: string; prompts: string[] }[] = [
  {
    group: "Looking inward",
    prompts: [
      "What did today teach me about myself?",
      "What am I avoiding, and why?",
      "What is the fear underneath my procrastination?",
      "Which story about myself is no longer true?",
    ],
  },
  {
    group: "The work",
    prompts: [
      "Where did I feel most alive in my studies today?",
      "What did I do today that the version of me from a year ago couldn't?",
      "If today were my last day of prep, was it worth it?",
      "What would I change about how I studied this week?",
    ],
  },
  {
    group: "Weight and worry",
    prompts: [
      "What would I tell a friend who had my day?",
      "What am I carrying that isn't mine to carry?",
      "What is the worst that happens, honestly?",
      "Who could I have leaned on today and didn't?",
    ],
  },
  {
    group: "Gratitude",
    prompts: [
      "What is one thing I'm grateful for right now?",
      "Who made today easier without being asked?",
      "What small thing went right that I nearly missed?",
    ],
  },
];

export const ALL_PROMPTS = PROMPT_GROUPS.flatMap((g) => g.prompts);

/**
 * A prompt chosen from the date, so it is stable through the day but different
 * tomorrow — a fresh random one on every render would change under the cursor.
 */
export function promptOfTheDay(today: ISODate): string {
  const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ALL_PROMPTS[seed % ALL_PROMPTS.length];
}

export interface ReflectionStats {
  total: number;
  /** Days written in a row, counting back from today. */
  streak: number;
  longestStreak: number;
  avgMood: number | null;
  /** Mean mood of the last five entries minus the five before, in mood points. */
  moodDrift: number | null;
  thisMonth: number;
  daysSinceLast: number | null;
  gratitudeCount: number;
  /** Mean characters written per entry — a rough proxy for depth. */
  avgLength: number;
}

/** Distinct dates that carry at least one reflection, newest first. */
function writtenDates(reflections: Reflection[]): ISODate[] {
  return [...new Set(reflections.map((r) => r.date))].sort((a, b) => b.localeCompare(a));
}

function shift(iso: ISODate, delta: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export function reflectionStats(
  reflections: Reflection[],
  today: ISODate,
): ReflectionStats {
  const dates = writtenDates(reflections);
  const set = new Set(dates);

  /* Today not yet written isn't a broken streak — it just hasn't happened. The
     count therefore starts at yesterday when today is blank. */
  let cursor = set.has(today) ? today : shift(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = shift(cursor, -1);
  }

  let longestStreak = 0;
  let run = 0;
  const asc = [...dates].reverse();
  asc.forEach((d, i) => {
    run = i > 0 && d === shift(asc[i - 1], 1) ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  });

  const moods = reflections.map((r) => r.mood).filter((m) => m > 0);
  const byDateDesc = [...reflections].sort((a, b) => b.date.localeCompare(a.date));
  const recent = byDateDesc.slice(0, 5).map((r) => r.mood).filter((m) => m > 0);
  const before = byDateDesc.slice(5, 10).map((r) => r.mood).filter((m) => m > 0);

  const month = today.slice(0, 7);

  return {
    total: reflections.length,
    streak,
    longestStreak,
    avgMood: moods.length ? round(avg(moods), 2) : null,
    moodDrift:
      recent.length && before.length ? round(avg(recent) - avg(before), 2) : null,
    thisMonth: reflections.filter((r) => r.date.startsWith(month)).length,
    daysSinceLast: dates.length
      ? Math.max(
          0,
          Math.round(
            (fromISODate(today).getTime() - fromISODate(dates[0]).getTime()) / 86_400_000,
          ),
        )
      : null,
    gratitudeCount: reflections.reduce((a, r) => a + (r.gratitude?.length ?? 0), 0),
    avgLength: reflections.length
      ? Math.round(avg(reflections.map((r) => r.content.trim().length)))
      : 0,
  };
}

/** Mood per reflection over time, oldest first, for a trend line. */
export function moodSeries(
  reflections: Reflection[],
  limit = 30,
): { date: ISODate; mood: number }[] {
  return [...reflections]
    .filter((r) => r.mood > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map((r) => ({ date: r.date, mood: r.mood }));
}

/** What comes up most often as something to be grateful for. */
export function gratitudeCounts(
  reflections: Reflection[],
): { text: string; count: number }[] {
  const counts = new Map<string, { text: string; count: number }>();
  for (const r of reflections) {
    for (const g of r.gratitude ?? []) {
      const text = g.trim();
      if (!text) continue;
      // Case-insensitive tally, but the first spelling seen is the one shown.
      const key = text.toLowerCase();
      const hit = counts.get(key);
      if (hit) hit.count++;
      else counts.set(key, { text, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.text.localeCompare(b.text),
  );
}
