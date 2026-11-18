"use client";

import { cn } from "@/lib/utils";

/**
 * Four strengths of the accent, from a faint tint to solid, each with a text
 * colour that keeps the count readable (4.5:1 or more) on both themes.
 */
const STEPS = [
  { bg: "rgb(var(--accent) / 0.12)", text: "text-accent" },
  { bg: "rgb(var(--accent) / 0.25)", text: "text-paper" },
  { bg: "rgb(var(--accent) / 0.45)", text: "text-paper" },
  { bg: "rgb(var(--accent))", text: "text-accent-fg" },
] as const;

function stepFor(v: number, max: number) {
  const r = max > 0 ? v / max : 0;
  return STEPS[r >= 1 ? 3 : r > 0.5 ? 2 : r > 0.25 ? 1 : 0];
}

/** A matrix heatmap (rows × cols): the more in a cell, the stronger its blue. */
export function MatrixHeatmap({
  rowLabels,
  colLabels,
  values,
  max,
  onCell,
  className,
}: {
  rowLabels: string[];
  colLabels: string[];
  values: number[][];
  max: number;
  onCell?: (row: number, col: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto no-scrollbar", className)}>
      <div
        className="inline-grid min-w-full gap-1"
        style={{
          gridTemplateColumns: `minmax(104px, 1.2fr) repeat(${colLabels.length}, minmax(48px, 1fr))`,
        }}
      >
        {/* header */}
        <div />
        {colLabels.map((c) => (
          <div key={c} title={c} className="truncate pb-1 text-center text-[0.68rem] font-medium text-paper/60">
            {c}
          </div>
        ))}

        {/* rows */}
        {rowLabels.map((rl, ri) => (
          <RowFragment
            key={rl + ri}
            label={rl}
            ri={ri}
            cols={colLabels}
            values={values[ri]}
            max={max}
            onCell={onCell}
          />
        ))}
      </div>
    </div>
  );
}

function RowFragment({
  label,
  ri,
  cols,
  values,
  max,
  onCell,
}: {
  label: string;
  ri: number;
  cols: string[];
  values: number[];
  max: number;
  onCell?: (row: number, col: number) => void;
}) {
  return (
    <>
      <div className="flex items-center truncate pr-2 text-sm text-paper/70">
        {label}
      </div>
      {cols.map((c, ci) => {
        const v = values[ci] ?? 0;
        const step = v ? stepFor(v, max) : null;
        return (
          <button
            key={c}
            disabled={!onCell || v === 0}
            onClick={() => onCell?.(ri, ci)}
            title={`${label} · ${c}: ${v}`}
            className={cn(
              "grid h-9 place-items-center rounded-md border border-paper/[0.05] transition-transform",
              v > 0 && onCell && "hover:scale-[1.06] cursor-pointer",
            )}
            style={{ background: step ? step.bg : "rgb(var(--paper) / 0.03)" }}
          >
            {step && <span className={cn("tabular text-[0.72rem] font-semibold", step.text)}>{v}</span>}
          </button>
        );
      })}
    </>
  );
}
