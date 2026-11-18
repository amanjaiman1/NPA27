import { cn, formatDate } from "@/lib/utils";

const REEL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Days to the exam, on a split-flap board: a tile for each digit, lit from
 * above, with a hinge across the middle. Inside every tile is a reel of 0–9
 * that rolls down to its digit when the dashboard opens, the way a countdown
 * should, and rolls again when the day changes. The look is in globals.css
 * (`.flap`), coloured by each theme.
 *
 * Days only. The exam is months away, and hours and minutes would be noise.
 */
export function ExamCountdown({
  daysLeft,
  examDate,
  exam,
  elapsed,
  className,
}: {
  daysLeft: number;
  examDate: string;
  exam: string;
  /** Share of the preparation time already behind you, 0–100. */
  elapsed: number;
  className?: string;
}) {
  const days = Math.max(0, daysLeft);
  const figure = String(days);
  // At least three tiles, so the board keeps its shape as the number falls;
  // the leading zeros are dimmed so the number itself reads first.
  const digits = figure.padStart(3, "0").split("").map(Number);
  const lead = digits.length - figure.length;

  const label =
    daysLeft > 1 ? "days to go" : daysLeft === 1 ? "day to go" : daysLeft === 0 ? "exam day" : "exam passed";
  const spoken =
    daysLeft > 0
      ? `${days} ${days === 1 ? "day" : "days"} to ${exam}, on ${formatDate(examDate)}`
      : daysLeft === 0
        ? `${exam} is today`
        : `${exam} was on ${formatDate(examDate)}`;

  return (
    <div
      className={cn("flex flex-col items-end gap-1.5", className)}
      title={`${formatDate(examDate)} · ${Math.round(elapsed)}% of your preparation time has passed`}
    >
      <p className="sr-only">{spoken}</p>
      <div aria-hidden className="flex gap-1 sm:gap-1.5">
        {digits.map((d, i) => (
          <span key={i} className={cn("flap", i < lead && "flap-lead")}>
            <span
              className="flap-reel"
              // The hundreds settle first and the units last, like a real board.
              style={{ transform: `translateY(${-d * 10}%)`, animationDelay: `${i * 120}ms` }}
            >
              {REEL.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        ))}
      </div>
      <p aria-hidden className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-paper/60">
        {label}
      </p>
    </div>
  );
}
