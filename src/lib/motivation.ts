/**
 * Lines shown when a day is marked accomplished.
 *
 * Chosen by day index rather than at random, so the same day always shows the
 * same line (a screenshot stays true) and consecutive days never repeat.
 * Written to sound like someone who respects the work — no exclamation marks,
 * no "you crushed it".
 */
const LINES = [
  "One more day the exam can't take back.",
  "This is what the rank is made of. Days like this.",
  "Nobody saw today. It still counts.",
  "The syllabus got smaller. Quietly, but it did.",
  "Discipline is just this, repeated.",
  "You showed up. That was the hard part.",
  "The version of you sitting in that hall is being built right now.",
  "Consistency beats intensity, and today was consistent.",
  "Another brick. The wall is getting taller.",
  "Tired is fine. Tired and done is better.",
  "You didn't negotiate with yourself today.",
  "Small margins, compounded. That's the whole strategy.",
  "The notes will fade. The habit won't.",
  "Today you were the candidate you keep describing.",
  "No shortcuts taken. Nothing to undo tomorrow.",
  "This is the unglamorous part. It's also the part that works.",
];

/** A milestone line takes over on the streak numbers that deserve one. */
const STREAK_LINES: Record<number, string> = {
  3: "Three in a row. A rhythm is starting.",
  7: "Seven straight days. That's a week you'll never have to re-do.",
  14: "Two unbroken weeks. This is no longer a phase.",
  21: "Twenty-one days. The habit has roots now.",
  30: "A full month, unbroken. Most people never get here.",
  50: "Fifty days. You've built something that runs on its own.",
  75: "Seventy-five days of showing up. That is a track record.",
  100: "One hundred days. Look back at day one and tell me it's the same person.",
  150: "One hundred and fifty. The exam is starting to look small.",
  200: "Two hundred days. This is what preparation actually looks like.",
  365: "A year, unbroken. Whatever the result, this already changed you.",
};

export function motivationFor(dayIndex: number, streak: number): string {
  return STREAK_LINES[streak] ?? LINES[Math.abs(dayIndex) % LINES.length];
}

/** The small line under the headline — a fact, not a compliment. */
export function accomplishmentSubline(streak: number, total: number): string {
  if (streak <= 1) return `${total} ${total === 1 ? "day" : "days"} accomplished so far.`;
  return `${streak} days in a row · ${total} accomplished in total.`;
}
