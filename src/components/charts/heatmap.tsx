"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/** Height reserved above the grid for the month labels. */
const MONTH_ROW_H = 16;
/** Below this a square stops reading as a square, so the grid scrolls instead. */
const MIN_CELL = 11;

export function Heatmap({
  cells,
  className,
  cellSize = 20,
  gap = 3,
  visibleWeeks = 13,
  formatTooltip,
  legendLow = "Less",
  legendHigh = "More",
}: {
  cells: HeatCell[];
  className?: string;
  /** Upper bound on a square's size. Squares never grow past this. */
  cellSize?: number;
  gap?: number;
  /**
   * How many week columns to aim to fit across the visible area — 13 is about
   * three months. The grid scrolls horizontally for everything older.
   */
  visibleWeeks?: number;
  formatTooltip?: (cell: HeatCell) => { primary: string; secondary: string };
  legendLow?: string;
  legendHigh?: string;
}) {
  const [hover, setHover] = useState<{
    cell: HeatCell;
    x: number;
    y: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(0);

  // Squares are sized from the width actually available, so the "three months
  // across" target holds on a phone as well as in a wide card.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setViewport(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cell =
    viewport > 0
      ? Math.max(MIN_CELL, Math.min(cellSize, Math.floor(viewport / visibleWeeks) - gap))
      : cellSize;
  const colWidth = cell + gap;

  // Build week columns. Pad the start so the first column begins on Sunday.
  const { weeks, monthLabels } = useMemo(() => {
    if (!cells.length) return { weeks: [] as (HeatCell | null)[][], monthLabels: [] as { col: number; label: string }[] };
    const padded: (HeatCell | null)[] = [];
    const firstDow = fromISODate(cells[0].date).getDay();
    for (let i = 0; i < firstDow; i++) padded.push(null);
    padded.push(...cells);
    const weeks: (HeatCell | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

    const marks: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, col) => {
      const first = week.find((c) => c);
      if (!first) return;
      const m = fromISODate(first.date).getMonth();
      if (m !== lastMonth) {
        marks.push({ col, label: MONTHS[m] });
        lastMonth = m;
      }
    });
    /* A twelve-month window starts and ends inside the same month, so labelling
       every change printed that month's name at both ends — "Sep Oct … Aug Sep",
       which reads like the range covers thirteen months.

       When a name repeats, keep the *last* occurrence. The right-hand end of the
       axis is the month you are in now, and that is the label that has to be
       right; the earlier one is a few days' stub of a month a year ago. */
    const monthLabels = marks.filter(
      (mk, i) => !marks.some((other, j) => j > i && other.label === mk.label),
    );
    return { weeks, monthLabels };
  }, [cells]);

  const contentWidth = weeks.length * colWidth - gap;

  /**
   * Open on the most recent weeks. The grid runs oldest-to-newest left-to-right,
   * so "now" lives at the far right and the useful default is scrolled fully over
   * — you then scroll back through the history. Re-runs when the geometry changes
   * (first measure, resize) rather than on every render, so it never fights a
   * scroll in progress.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks.length, colWidth]);

  return (
    <div className={cn("relative w-full", className)}>
      <div className="flex">
        {/* Weekday labels — pinned outside the scroller so they stay put while
            the grid moves. Offset by the month row so rows line up. Hidden on
            phones, where the width is better spent on squares. */}
        <div
          className="mr-1.5 hidden shrink-0 flex-col sm:flex"
          style={{ gap, marginTop: MONTH_ROW_H }}
        >
          {WEEKDAY_LABELS.map((d, i) => (
            <span
              key={i}
              className="flex items-center text-[0.55rem] leading-none text-paper/30"
              style={{ height: cell }}
            >
              {d}
            </span>
          ))}
        </div>

        {/* The scroller. `min-w-0` is what lets it shrink inside the flex row
            instead of pushing the page wider than the screen. */}
        <div
          ref={scrollRef}
          onScroll={() => setHover(null)}
          className="no-scrollbar min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
        >
          <div style={{ width: contentWidth }}>
            {/* Month labels — inside the scroller, so they travel with the
                columns they name, and positioned by column offset rather than by
                percentage, so they sit exactly over them. */}
            <div className="relative" style={{ height: MONTH_ROW_H }}>
              {monthLabels.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="absolute top-0 whitespace-nowrap text-[0.6rem] text-paper/35"
                  style={{ left: m.col * colWidth }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            <div className="flex" style={{ gap }}>
              {weeks.map((week, ci) => (
                <div key={ci} className="flex flex-col" style={{ gap }}>
                  {week.map((c, ri) =>
                    c ? (
                      <div
                        key={c.date}
                        onMouseEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setHover({ cell: c, x: r.left + r.width / 2, y: r.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        className={cn(
                          "rounded-[2px] transition-colors duration-150 hover:ring-1 hover:ring-accent/50",
                          LEVEL_BG[c.level],
                        )}
                        style={{ width: cell, height: cell }}
                      />
                    ) : (
                      <div
                        key={`empty-${ci}-${ri}`}
                        style={{ width: cell, height: cell }}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
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
        <span className="ml-auto text-paper/30">scroll back for earlier months</span>
      </div>

      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-center shadow-lift"
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
