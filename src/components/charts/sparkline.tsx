import { useId } from "react";
import { cn } from "@/lib/utils";

/** Which colour the line takes: the theme's chart blue, or a trend colour. */
export type SparkTone = "accent" | "up" | "down";

const STROKE: Record<SparkTone, string> = {
  accent: "var(--bloom-1)",
  up: "var(--vivid-up)",
  down: "var(--vivid-down)",
};

export function Sparkline({
  values,
  width = 120,
  height = 32,
  className,
  fill = true,
  tone = "accent",
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  fill?: boolean;
  tone?: SparkTone;
  /** What the line shows, for screen readers. Without one it's decorative. */
  label?: string;
}) {
  const gid = `sl-${useId().replace(/:/g, "")}`;
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pad = 2;
  const x = (i: number) => pad + (i / (values.length - 1 || 1)) * (width - pad * 2);
  const y = (v: number) => pad + (height - pad * 2) - ((v - min) / (max - min || 1)) * (height - pad * 2);
  // A gentle curve through the points (Catmull–Rom), so the line reads as a trend.
  const pts = values.map((v, i) => [x(i), y(v)] as const);
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    line += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const area = `${line} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  const color = STROKE[tone];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgb(${color})`} stopOpacity="0.22" />
          <stop offset="100%" stopColor={`rgb(${color})`} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={`rgb(${color})`} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
