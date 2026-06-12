"use client";

import { cn } from "@/lib/utils";

/** A grayscale matrix heatmap (rows × cols) with intensity by value. */
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
          gridTemplateColumns: `minmax(104px, 1.2fr) repeat(${colLabels.length}, minmax(44px, 1fr))`,
        }}
      >
        {/* header */}
        <div />
        {colLabels.map((c) => (
          <div
            key={c}
            className="pb-1 text-center text-[0.58rem] font-medium uppercase tracking-wide text-paper/40"
          >
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
        const op = v ? 0.12 + (v / max) * 0.8 : 0;
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
            style={{ background: v ? `rgb(var(--paper) / ${op})` : "rgb(var(--paper) / 0.03)" }}
          >
            {v > 0 && (
              <span
                className={cn(
                  "tabular text-[0.7rem] font-semibold",
                  op > 0.55 ? "text-ink" : "text-paper/75",
                )}
              >
                {v}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}
