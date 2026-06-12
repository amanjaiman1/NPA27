"use client";

import { useMemo, useState } from "react";
import type { HeatCell } from "@/lib/selectors";
import { fromISODate, formatDate, formatHours } from "@/lib/utils";
import { cn } from "@/lib/utils";

const LEVEL_BG = [
  "bg-paper/[0.05]",
  "bg-accent/25",
  "bg-accent/45",
  "bg-accent/65",
  "bg-accent/90",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export function Heatmap({
  cells,
  className,
  cellSize = 12,
  gap = 3,
  formatTooltip,
  legendLow = "Less",
  legendHigh = "More",
}: {
  cells: HeatCell[];
  className?: string;
  /** Treated as the *maximum* column size on wide screens. The grid shrinks
   *  fluidly to fit narrower containers so it never scrolls horizontally. */
  cellSize?: number;
  gap?: number;
  formatTooltip?: (cell: HeatCell) => { primary: string; secondary: string };
  legendLow?: string;
  legendHigh?: string;
}) {
  const [hover, setHover] = useState<{
    cell: HeatCell;
    x: number;
    y: number;
  } | null>(null);

  // Build week columns. Pad the start so the first column begins on Sunday.
  const { weeks, monthLabels } = useMemo(() => {
    if (!cells.length) return { weeks: [] as (HeatCell | null)[][], monthLabels: [] as { col: number; label: string }[] };
    const padded: (HeatCell | null)[] = [];
    const firstDow = fromISODate(cells[0].date).getDay();
    for (let i = 0; i < firstDow; i++) padded.push(null);
    padded.push(...cells);
    const weeks: (HeatCell | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, col) => {
      const first = week.find((c) => c);
      if (!first) return;
      const m = fromISODate(first.date).getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ col, label: MONTHS[m] });
        lastMonth = m;
      }
    });
    return { weeks, monthLabels };
  }, [cells]);

  // Cap the grid width on wide screens; below that it fills 100% of its
  // container, so the squares scale down instead of overflowing.
  const maxGridWidth = weeks.length * (cellSize + gap);

  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      {/* Month labels — aligned over the columns area */}
      <div className="mb-1 flex h-3">
        <div className="mr-1 hidden w-5 shrink-0 sm:block" />
        <div
          className="relative flex-1 text-[0.6rem] text-paper/35"
          style={{ maxWidth: maxGridWidth }}
        >
          {monthLabels.map((m) => (
            <span
              key={`${m.col}-${m.label}`}
              className="absolute whitespace-nowrap"
              style={{ left: `${(m.col / weeks.length) * 100}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* Weekday labels — hidden on phones to free up width */}
        <div className="mr-1 hidden w-5 shrink-0 flex-col gap-[2px] sm:flex sm:gap-[3px]">
          {WEEKDAY_LABELS.map((d, i) => (
            <span
              key={i}
              className="flex flex-1 items-center text-[0.55rem] leading-none text-paper/30"
            >
              {d}
            </span>
          ))}
        </div>

        {/* Week columns — flex so they fill the available width and stay square */}
        <div
          className="flex flex-1 gap-[2px] sm:gap-[3px]"
          style={{ maxWidth: maxGridWidth }}
        >
          {weeks.map((week, ci) => (
            <div key={ci} className="flex flex-1 flex-col gap-[2px] sm:gap-[3px]">
              {week.map((cell, ri) =>
                cell ? (
                  <div
                    key={cell.date}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setHover({ cell, x: r.left + r.width / 2, y: r.top });
                    }}
                    onMouseLeave={() => setHover(null)}
                    className={cn(
                      "aspect-square w-full rounded-[2px] transition-colors duration-150 hover:ring-1 hover:ring-accent/50",
                      LEVEL_BG[cell.level],
                    )}
                  />
                ) : (
                  <div
                    key={`empty-${ci}-${ri}`}
                    className="aspect-square w-full"
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-1.5 text-[0.6rem] text-paper/40">
        <span>{legendLow}</span>
        {LEVEL_BG.map((bg, i) => (
          <span
            key={i}
            className={cn("h-2.5 w-2.5 rounded-[3px]", bg)}
          />
        ))}
        <span>{legendHigh}</span>
      </div>

      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-paper/15 bg-ink px-2.5 py-1.5 text-center shadow-glow"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          <p className="tabular text-xs font-semibold text-paper">
            {formatTooltip
              ? formatTooltip(hover.cell).primary
              : hover.cell.hours > 0
                ? formatHours(hover.cell.hours)
                : "Rest day"}
          </p>
          <p className="whitespace-nowrap text-[0.6rem] text-paper/50">
            {formatTooltip
              ? formatTooltip(hover.cell).secondary
              : formatDate(hover.cell.date)}
          </p>
        </div>
      )}
    </div>
  );
}
