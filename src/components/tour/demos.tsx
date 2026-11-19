"use client";

import { useId, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Bookmark,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  Command,
  CornerDownLeft,
  Droplets,
  Flag,
  Flame,
  Flower2,
  Footprints,
  Link2,
  Lock,
  Moon,
  Repeat,
  Search,
  Snowflake,
  Sun,
  TrendingUp,
  WifiOff,
  X,
} from "lucide-react";
import { useChronicle } from "@/lib/store";
import { THEME_MODES, surfaceFor, type ThemeMode } from "@/lib/theme";
import { SR_INTERVALS } from "@/lib/revision";
import { cn } from "@/lib/utils";
import { CountUp, EASE_OUT, Typewriter, isMac, pop, rise } from "./kit";
import type { TourData } from "./tour-data";

/* ════════════════════════════════════════════════════════════════
   THE FEATURE TOUR — the illustrations
   One small, live picture of each feature, drawn in the theme's own
   colours with this account's subjects, habits and books. They are
   pictures, not the pages themselves: the figures are examples. Each
   plays once when it appears and again whenever it is picked; `t0` is
   when its story starts.

   Every picture has to read at any size it is given, from a narrow tile
   on a small laptop to the single tall card on a phone. Extras drop out
   in small tiles (`tour-hide-narrow`, `tour-hide-short`, container
   queries in globals.css).
   ════════════════════════════════════════════════════════════════ */

export type DemoId =
  | "journal"
  | "habits"
  | "life"
  | "library"
  | "revision"
  | "mistakes"
  | "current"
  | "subjects"
  | "heatmap"
  | "mocks"
  | "graph"
  | "goals"
  | "roadmap"
  | "timeline"
  | "reviews"
  | "diary"
  | "coach"
  | "search"
  | "notify"
  | "themes"
  | "install";

export interface DemoProps {
  data: TourData;
  /** Seconds before the picture starts to play. */
  t0: number;
}

/** Pictures with real controls in them, which screen readers must reach. */
export const INTERACTIVE_DEMOS = new Set<DemoId>(["themes"]);

/** Written out in full so Tailwind sees each class. */
const BLOOM_BG = ["bg-bloom-1", "bg-bloom-2", "bg-bloom-3", "bg-bloom-4", "bg-bloom-5", "bg-bloom-6"];

/* ── small parts ─────────────────────────────────────────────── */

/** A progress bar that fills to `value` (0–1). */
function Bar({ value, delay, className, slim }: { value: number; delay: number; className?: string; slim?: boolean }) {
  return (
    <span className={cn("mt-1 block overflow-hidden rounded-full bg-paper/[0.08]", slim ? "h-1" : "h-1.5")}>
      <motion.span
        className={cn("block h-full rounded-full", className ?? "bg-accent")}
        initial={{ width: 0 }}
        animate={{ width: `${Math.round(value * 100)}%` }}
        transition={{ delay, duration: 1.1, ease: EASE_OUT }}
      />
    </span>
  );
}

/** A tick that draws itself. */
function DrawnCheck({ delay, className }: { delay: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay, duration: 0.35, ease: EASE_OUT }}
      />
    </svg>
  );
}

/** A ring that fills to `value` (0–1), with whatever sits in its middle. */
function Ring({
  value,
  delay,
  duration = 1.4,
  rotate = 0,
  className,
  children,
}: {
  value: number;
  delay: number;
  duration?: number;
  /** Where the arc starts, as a fraction of a turn from the top. */
  rotate?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative aspect-square", className)}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-paper/10" />
        <g transform={`rotate(${rotate * 360} 50 50)`}>
          <motion.circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className="stroke-accent"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: value, opacity: 1 }}
            transition={{ delay, duration, ease: EASE_OUT, opacity: { delay, duration: 0.2 } }}
          />
        </g>
      </svg>
      {children && <div className="absolute inset-0 grid place-content-center text-center">{children}</div>}
    </div>
  );
}

/** A big figure with a small unit and a caption under it. */
function Figure({
  children,
  unit,
  caption,
  className,
}: {
  children: React.ReactNode;
  unit?: string;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex items-baseline gap-0.5 text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-paper">
        {children}
        {unit && <span className="text-[0.7rem] font-medium tracking-normal text-paper/50">{unit}</span>}
      </p>
      {caption && <p className="mt-1 truncate text-[0.6rem] text-paper/55">{caption}</p>}
    </div>
  );
}

/** A small rounded label. */
function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.56rem] font-semibold leading-[1.5]",
        className ?? "bg-paper/[0.06] text-paper/65",
      )}
    >
      {children}
    </span>
  );
}

/* ── 1. Every day ────────────────────────────────────────────── */

function JournalDemo({ data, t0 }: DemoProps) {
  const hours = [3, 2, 1.5];
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex min-h-0 gap-3">
        <div className="flex w-[40%] min-w-[7rem] max-w-[11rem] flex-col justify-between gap-2 rounded-2xl bg-paper/[0.04] p-3">
          <div className="min-w-0">
            <p className="truncate text-[0.62rem] font-medium text-paper/55">{data.weekday}</p>
            <p className="text-[0.66rem] font-semibold text-accent">Day {data.journeyDay}</p>
          </div>
          <Figure unit="h" caption="studied today">
            <CountUp to={6.5} delay={t0 + 0.2} format={(n) => n.toFixed(1)} />
          </Figure>
          <div>
            <p className="mb-1 text-[0.55rem] text-paper/55">Mood</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((m) => (
                <motion.span
                  key={m}
                  className={cn("h-1.5 flex-1 rounded-full", m <= 4 ? "bg-accent" : "bg-paper/10")}
                  initial={{ opacity: 0, scaleX: 0.3 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: t0 + 0.8 + m * 0.07, duration: 0.35, ease: EASE_OUT }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {data.subjects.slice(0, 3).map((name, i) => (
            <motion.div key={name} className="min-w-0" {...rise(t0 + i * 0.08, 6)}>
              <div className="flex items-baseline justify-between gap-2 text-[0.63rem]">
                <span className="truncate font-medium text-paper/80">{name}</span>
                <span className="tabular shrink-0 text-paper/55">{hours[i]}h</span>
              </div>
              <Bar value={hours[i] / 3} delay={t0 + 0.3 + i * 0.14} className={BLOOM_BG[i]} />
            </motion.div>
          ))}
          <motion.div
            {...rise(t0 + 0.9, 6)}
            className="mt-auto rounded-xl border border-line bg-card px-2.5 py-2 text-[0.63rem] leading-snug text-paper/80"
          >
            <Typewriter text={`Finished ${data.topics[0]}.`} delay={t0 + 1.1} speed={30} />
          </motion.div>
        </div>
      </div>
      <motion.div {...rise(t0 + 1.5, 6)} className="tour-only-roomy flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="text-[0.58rem] text-paper/55">Topics finished</span>
        {data.topics.slice(0, 2).map((topic) => (
          <Chip key={topic} className="bg-positive/10 text-positive">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
            {topic}
          </Chip>
        ))}
      </motion.div>
    </div>
  );
}

/** The days missed in the made-up last four weeks: 24 of 28 kept. */
const MISSED = new Set([3, 9, 17, 22]);

function HabitsDemo({ data, t0 }: DemoProps) {
  const week = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-end justify-between gap-2">
        <Figure caption="day streak">
          <CountUp to={12} delay={t0 + 1.3} duration={0.9} />
        </Figure>
        <motion.span {...pop(t0 + 1.4)} className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-warning/10 text-warning">
          <Flame className="tour-float h-5 w-5" />
        </motion.span>
      </div>

      <ul className="space-y-1.5">
        {data.habits.map((habit, i) => {
          const at = t0 + 0.35 + i * 0.38;
          return (
            <motion.li
              key={habit.name}
              {...rise(t0 + i * 0.07, 6)}
              className="flex min-w-0 items-center gap-2.5 rounded-xl bg-paper/[0.04] px-2.5 py-2"
            >
              <span className="relative grid h-5 w-5 shrink-0 place-items-center">
                <span className="absolute inset-0 rounded-full border-2 border-paper/20" />
                <motion.span
                  className="absolute inset-0 rounded-full bg-positive"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: at, type: "spring", stiffness: 520, damping: 18 }}
                />
                <DrawnCheck delay={at + 0.1} className="relative h-3 w-3 text-card" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium text-paper/85">{habit.name}</span>
              <span className="tour-hide-short shrink-0 truncate text-[0.52rem] text-paper/50">{habit.from}</span>
            </motion.li>
          );
        })}
      </ul>

      <motion.div {...rise(t0 + 0.5, 8)} className="tour-only-tall rounded-2xl bg-paper/[0.04] p-3">
        <div className="flex items-baseline justify-between gap-2 text-[0.6rem]">
          <span className="truncate font-semibold text-paper/80">Last four weeks</span>
          <span className="shrink-0 text-paper/55">86% kept</span>
        </div>
        <div className="mt-2.5 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 28 }, (_, i) => (
            <span
              key={i}
              className={cn("tour-pop-in mx-auto block aspect-square w-full max-w-[1.1rem] rounded-full", MISSED.has(i) ? "bg-paper/10" : "bg-positive/70")}
              style={{ animationDelay: `${t0 + 0.6 + i * 0.025}s` }}
            />
          ))}
        </div>
      </motion.div>

      {/* The week, where there's room and the four weeks above aren't showing. */}
      <div className="tour-only-roomy tour-hide-tall mt-auto grid grid-cols-7 gap-1">
        {week.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <motion.span
              className={cn("block h-5 w-full max-w-[1.3rem] rounded-md", i < 6 ? "bg-accent/60" : "tour-ping bg-accent")}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: t0 + 0.15 + i * 0.05, duration: 0.4, ease: EASE_OUT }}
            />
            <span className="text-[0.52rem] text-paper/50">{d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LifeDemo({ data, t0 }: DemoProps) {
  // 11:30 PM to 6:50 AM: seven hours and twenty minutes, about a third of
  // the clock, starting just before midnight.
  const minutes = 7 * 60 + 20;
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2">
      <Ring value={minutes / (24 * 60)} rotate={23.5 / 24} delay={t0 + 0.3} className="w-[min(100%,7rem)]">
        <p className="text-[0.95rem] font-semibold leading-none tracking-[-0.03em] text-paper">
          <CountUp
            to={minutes}
            delay={t0 + 0.3}
            duration={1.4}
            format={(n) => {
              const m = Math.round(n);
              return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
            }}
          />
        </p>
        <p className="mt-1 text-[0.55rem] text-paper/55">asleep</p>
      </Ring>
      <motion.p {...rise(t0 + 1.2, 4)} className="flex items-center gap-1 whitespace-nowrap text-[0.6rem] text-paper/70">
        <Moon className="h-3 w-3 text-accent" />
        {data.clock("23:30")}
        <ArrowRight className="h-3 w-3 text-paper/35" />
        <Sun className="h-3 w-3 text-warning" />
        {data.clock("06:50")}
      </motion.p>
      <motion.div {...rise(t0 + 1.4, 4)} className="tour-hide-short flex flex-wrap justify-center gap-1">
        <Chip>
          <Droplets className="h-2.5 w-2.5 text-info" />
          2.5 L
        </Chip>
        <Chip>
          <Footprints className="h-2.5 w-2.5 text-positive" />
          3.2 km
        </Chip>
      </motion.div>
    </div>
  );
}

function LibraryDemo({ data, t0 }: DemoProps) {
  const read = [0.46, 0.28, 0.71];
  return (
    <ul className="flex h-full min-h-0 flex-col justify-center gap-2.5">
      {data.books.slice(0, 3).map((book, i) => (
        <motion.li key={book.title} {...rise(t0 + i * 0.1, 8)} className="flex min-w-0 items-center gap-2.5">
          <span className={cn("relative h-10 w-7 shrink-0 overflow-hidden rounded-[0.35rem] shadow-soft", BLOOM_BG[i])}>
            <span className="absolute inset-y-0 left-1 w-px bg-white/40" />
            <span className="absolute inset-x-1.5 top-2 h-0.5 rounded-full bg-white/50" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.66rem] font-semibold text-paper/85">{book.title}</p>
            <p className="tabular truncate text-[0.56rem] text-paper/55">
              Page <CountUp to={Math.round(book.pages * read[i])} delay={t0 + 0.3 + i * 0.12} duration={1.1} /> of {book.pages}
            </p>
            <Bar value={read[i]} delay={t0 + 0.3 + i * 0.12} className={BLOOM_BG[i]} slim />
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

/* ── 2. Remember ─────────────────────────────────────────────── */

function RevisionDemo({ data, t0 }: DemoProps) {
  // Gaps drawn to scale, softened so the short ones still have room.
  const at = (d: number) => Math.pow(d / SR_INTERVALS[SR_INTERVALS.length - 1], 0.6);
  const travel = 2.4;
  const start = t0 + 0.4;
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.74rem] font-semibold text-paper">{data.topics[0]}</p>
          <p className="truncate text-[0.6rem] text-paper/55">{data.subjects[0]}</p>
        </div>
        <motion.span {...pop(start + travel)} className="flex">
          <Chip className="bg-positive/10 text-positive">
            <Check className="h-2.5 w-2.5" />
            Remembered 6 times
          </Chip>
        </motion.span>
      </div>

      <div className="relative mx-1.5 h-9">
        <span className="absolute inset-x-0 top-2 h-px bg-paper/15" />
        <motion.span
          className="absolute left-0 top-[0.45rem] h-[2px] rounded-full bg-accent"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ delay: start, duration: travel, ease: "linear" }}
        />
        {[0, ...SR_INTERVALS].map((d, i) => {
          const x = at(d);
          const first = i === 0;
          const last = i === SR_INTERVALS.length;
          return (
            <span
              key={d}
              className={cn("absolute top-0 flex flex-col", first ? "items-start" : last ? "items-end" : "items-center")}
              style={{
                left: `${x * 100}%`,
                transform: first ? "translateX(-0.25rem)" : last ? "translateX(calc(-100% + 0.25rem))" : "translateX(-50%)",
              }}
            >
              <span className="relative block h-4 w-4 rounded-full border-2 border-paper/20 bg-card">
                <motion.span
                  className="absolute -inset-0.5 rounded-full bg-accent"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: start + travel * x, type: "spring", stiffness: 520, damping: 17 }}
                />
              </span>
              <span className="mt-1 whitespace-nowrap text-[0.54rem] font-medium text-paper/55">{first ? "Learnt" : d}</span>
            </span>
          );
        })}
      </div>

      <div className="tour-hide-short grid grid-cols-3 gap-2">
        {[
          { label: "Due today", value: 4 },
          { label: "Overdue", value: 1 },
          { label: "Next 7 days", value: 12 },
        ].map((s, i) => (
          <motion.div key={s.label} {...rise(t0 + 0.2 + i * 0.08, 6)} className="rounded-xl bg-paper/[0.04] px-2.5 py-2">
            <p className="text-[1rem] font-semibold leading-none text-paper">
              <CountUp to={s.value} delay={t0 + 0.5 + i * 0.1} duration={0.9} />
            </p>
            <p className="mt-1 truncate text-[0.55rem] text-paper/55">{s.label}</p>
          </motion.div>
        ))}
      </div>
      <p className="tour-hide-narrow -mt-1 text-[0.56rem] text-paper/50">Days after you learn it: each gap is longer than the last.</p>
    </div>
  );
}

function AnswerRow({ label, verdict, delay }: { label: string; verdict: "wrong" | "right"; delay: number }) {
  const right = verdict === "right";
  return (
    <div className="relative flex items-center gap-2 overflow-hidden rounded-xl border border-line px-2.5 py-1.5">
      <motion.span
        className={cn("absolute inset-0", right ? "bg-positive/10" : "bg-danger/10")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay, duration: 0.3 }}
      />
      <span className="relative min-w-0 flex-1 truncate text-[0.64rem] font-medium text-paper/85">{label}</span>
      <motion.span
        {...pop(delay + 0.05)}
        className={cn("relative grid h-4 w-4 shrink-0 place-items-center rounded-full text-card", right ? "bg-positive" : "bg-danger")}
      >
        {right ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <X className="h-2.5 w-2.5" strokeWidth={3} />}
      </motion.span>
      <motion.span {...rise(delay + 0.15, 0)} className="relative shrink-0 text-[0.54rem] text-paper/55">
        {right ? "Correct" : "Yours"}
      </motion.span>
    </div>
  );
}

function MistakesDemo({ t0 }: DemoProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <p className="text-[0.66rem] font-medium leading-snug text-paper/85">
        Which article of the Constitution abolishes untouchability?
      </p>
      <AnswerRow label="Article 15" verdict="wrong" delay={t0 + 0.4} />
      <AnswerRow label="Article 17" verdict="right" delay={t0 + 0.85} />
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <motion.span {...pop(t0 + 1.3)} className="flex">
          <Chip className="bg-warning/10 text-warning">Factual</Chip>
        </motion.span>
        <div className="flex items-center gap-1.5">
          <span className="tour-hide-narrow text-[0.55rem] text-paper/55">Right in a row</span>
          {[0, 1, 2].map((i) => (
            <span key={i} className="relative block h-2 w-2 rounded-full bg-paper/15">
              <motion.span
                className="absolute inset-0 rounded-full bg-positive"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: t0 + 1.6 + i * 0.3, type: "spring", stiffness: 500, damping: 18 }}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CurrentDemo({ data, t0 }: DemoProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Chip>Newspaper · today</Chip>
        <motion.span {...pop(t0 + 1.6)} className="ml-auto text-accent">
          <Bookmark className="h-3.5 w-3.5 fill-current" />
        </motion.span>
      </div>
      <p className="text-[0.74rem] font-semibold leading-snug text-paper">
        <Typewriter text="Notes on the monetary policy review" delay={t0 + 0.25} speed={30} />
      </p>
      <div className="flex flex-wrap gap-1">
        {["Prelims", "Mains"].map((tag, i) => (
          <motion.span key={tag} {...pop(t0 + 1 + i * 0.12)} className="flex">
            <Chip className="bg-accent/10 text-accent">{tag}</Chip>
          </motion.span>
        ))}
        <motion.span {...pop(t0 + 1.3)} className="flex">
          <Chip>
            <Link2 className="h-2.5 w-2.5" />
            {data.shortSubjects[1]}
          </Chip>
        </motion.span>
      </div>
      <div className="tour-hide-short mt-auto space-y-1.5">
        {[0.92, 0.7].map((w, i) => (
          <motion.span
            key={i}
            className="block h-1.5 rounded-full bg-paper/[0.08]"
            initial={{ width: 0 }}
            animate={{ width: `${w * 100}%` }}
            transition={{ delay: t0 + 1.4 + i * 0.12, duration: 0.7, ease: EASE_OUT }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── 3. Where you stand ──────────────────────────────────────── */

function SubjectsDemo({ data, t0 }: DemoProps) {
  const covered = [0.62, 0.48, 0.35, 0.2];
  return (
    <ul className="flex h-full min-h-0 flex-col justify-center gap-2">
      {data.subjects.slice(0, 4).map((name, i) => (
        <motion.li key={name} {...rise(t0 + i * 0.07, 6)} className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-[0.63rem]">
            <span className="truncate font-medium text-paper/85">{name}</span>
            {i === 3 && (
              <motion.span {...pop(t0 + 1.5)} className="tour-hide-narrow flex">
                <Chip className="bg-info/10 text-info">
                  <Snowflake className="h-2.5 w-2.5" />
                  Going cold
                </Chip>
              </motion.span>
            )}
            <span className="tabular ml-auto shrink-0 text-paper/60">
              <CountUp to={covered[i] * 100} delay={t0 + 0.3 + i * 0.1} duration={1.1} format={(n) => `${Math.round(n)}%`} />
            </span>
          </div>
          <Bar value={covered[i]} delay={t0 + 0.3 + i * 0.1} className={BLOOM_BG[i]} />
        </motion.li>
      ))}
    </ul>
  );
}

/** How busy a day in the made-up heatmap was, 0–4. Busier lately. */
function heatLevel(i: number, total: number): number {
  const noise = Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1;
  const lately = i / total;
  if (i > total - 10) return 2 + Math.round(noise * 2);
  if (noise < 0.2 - lately * 0.12) return 0;
  return Math.max(1, Math.min(4, Math.round(noise * 2.2 + lately * 1.8)));
}

function HeatmapDemo({ t0 }: DemoProps) {
  const weeks = 36;
  const cells = useMemo(() => Array.from({ length: weeks * 7 }, (_, i) => heatLevel(i, weeks * 7)), []);
  return (
    <div className="flex h-full min-h-0 flex-col justify-between gap-2">
      {/* Anchored right, so a narrow tile keeps the latest weeks. */}
      <div className="flex min-h-0 justify-end overflow-hidden">
        <div className="grid shrink-0 grid-flow-col grid-rows-7 gap-[3px]">
          {cells.map((level, i) => (
            <span
              key={i}
              data-level={level}
              className={cn("tour-heat tour-pop-in block h-[0.58rem] w-[0.58rem] rounded-[3px]", i === cells.length - 1 && "tour-ping")}
              style={{ animationDelay: `${t0 + Math.floor(i / 7) * 0.03 + (i % 7) * 0.012}s` }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <Figure unit=" days" caption="current streak">
          <CountUp to={9} delay={t0 + 0.7} duration={1} />
        </Figure>
        <div className="tour-hide-narrow flex items-center gap-1 text-[0.54rem] text-paper/50">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} data-level={l} className="tour-heat block h-2 w-2 rounded-[2px]" />
          ))}
          More
        </div>
      </div>
    </div>
  );
}

function MocksDemo({ t0 }: DemoProps) {
  const scores = [92, 101, 97, 108, 104, 118];
  const W = 300;
  const H = 100;
  const pts = scores.map((s, i) => [12 + (i / (scores.length - 1)) * (W - 24), H - 10 - ((s - 85) / 40) * (H - 20)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`;
  const draw = 1.3;
  const fill = `tour-mock-${useId().replace(/:/g, "")}`;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <Figure unit=" / 200" caption="Prelims GS, latest mock">
          <CountUp to={118} delay={t0 + 0.4} duration={1.3} />
        </Figure>
        <motion.span {...pop(t0 + 1.6)} className="flex">
          <Chip className="bg-positive/10 text-positive">
            <TrendingUp className="h-3 w-3" />
            14 up
          </Chip>
        </motion.span>
      </div>
      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "rgb(var(--accent))", stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: "rgb(var(--accent))", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="stroke-paper/[0.06]" strokeWidth="1" />
          ))}
          <motion.path
            d={area}
            fill={`url(#${fill})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: t0 + 0.3 + draw * 0.7, duration: 0.8 }}
          />
          <motion.path
            d={line}
            fill="none"
            className="stroke-accent"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: t0 + 0.3, duration: draw, ease: "easeInOut" }}
          />
          {pts.map(([x, y], i) => (
            <motion.circle
              key={i}
              cx={x}
              cy={y}
              r={i === pts.length - 1 ? 6 : 4.5}
              strokeWidth="3"
              className={cn("stroke-accent", i === pts.length - 1 ? "fill-accent" : "fill-card")}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: t0 + 0.3 + (i / (pts.length - 1)) * draw, type: "spring", stiffness: 500, damping: 18 }}
            />
          ))}
        </svg>
      </div>
      <p className="tour-hide-short truncate text-[0.56rem] text-paper/55">8.7 marks lost to negative marking</p>
    </div>
  );
}

function GraphDemo({ data, t0 }: DemoProps) {
  const W = 200;
  const H = 120;
  // A hub and five neighbours, placed so no two labels meet.
  const nodes = [
    { x: 100, y: 60 },
    { x: 34, y: 26 },
    { x: 166, y: 24 },
    { x: 30, y: 96 },
    { x: 170, y: 94 },
    { x: 100, y: 12 },
  ];
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 3],
    [2, 4],
    [1, 5],
    [5, 2],
  ];
  const labels = data.shortSubjects;
  return (
    <div className="relative h-full min-h-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {edges.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            className={i === 0 ? "stroke-accent" : "stroke-paper/20"}
            strokeWidth={i === 0 ? 2 : 1.2}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: t0 + 0.25 + i * 0.09, duration: 0.6, ease: EASE_OUT }}
          />
        ))}
        {/* Something travelling along the highlighted link. */}
        <motion.circle
          r="2.6"
          className="fill-accent"
          initial={{ cx: nodes[0].x, cy: nodes[0].y, opacity: 0 }}
          animate={{ cx: [nodes[0].x, nodes[1].x], cy: [nodes[0].y, nodes[1].y], opacity: [0, 1, 1, 0] }}
          transition={{ delay: t0 + 1.4, duration: 1.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.8 }}
        />
        {nodes.map((n, i) => (
          <g key={i}>
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={i === 0 ? 7.5 : 5}
              className={i === 0 || i === 1 ? "fill-accent" : "fill-card stroke-paper/40"}
              strokeWidth="1.5"
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: t0 + 0.15 + i * 0.08, type: "spring", stiffness: 420, damping: 16 }}
            />
            <motion.text
              x={n.x}
              y={n.y + (i === 0 ? 19 : 15)}
              textAnchor="middle"
              className={cn("text-[8.5px] font-medium", i === 0 ? "fill-paper" : "fill-paper/75")}
              style={{ paintOrder: "stroke", stroke: "rgb(var(--glass-tint))", strokeWidth: 3, strokeLinejoin: "round" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: t0 + 0.5 + i * 0.08, duration: 0.4 }}
            >
              {labels[i] ?? ""}
            </motion.text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── 4. Plan ─────────────────────────────────────────────────── */

function GoalsDemo({ data, t0 }: DemoProps) {
  const more = [
    { icon: Clock, name: "Log 120 hours", value: 0.7 },
    { icon: BookOpen, name: `Read ${data.books[0]?.title ?? "a standard book"}`, value: 0.46 },
    { icon: Repeat, name: "Revise 40 topics", value: 0.35 },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <motion.div {...rise(t0, 8)} className="flex min-w-0 items-center gap-3 rounded-2xl bg-paper/[0.04] p-3">
        <Ring value={0.64} delay={t0 + 0.25} className="w-[4.25rem] shrink-0">
          <p className="text-[0.82rem] font-semibold leading-none text-paper">
            <CountUp to={64} delay={t0 + 0.25} duration={1.4} format={(n) => `${Math.round(n)}%`} />
          </p>
        </Ring>
        <div className="min-w-0">
          <p className="truncate text-[0.74rem] font-semibold text-paper">Finish {data.shortSubjects[0]}</p>
          <p className="truncate text-[0.6rem] text-paper/55">by the end of {data.monthName}</p>
          <motion.span {...pop(t0 + 1.5)} className="mt-1.5 flex">
            <Chip className="bg-positive/10 text-positive">
              <TrendingUp className="h-3 w-3" />
              On pace
            </Chip>
          </motion.span>
        </div>
      </motion.div>
      <PaceChart t0={t0} />
      <ul className="tour-hide-short space-y-2">
        {more.map((g, i) => (
          <motion.li key={g.name} {...rise(t0 + 0.3 + i * 0.1, 6)} className={cn("min-w-0 px-0.5", i === 2 && "tour-only-roomy")}>
            <div className="flex min-w-0 items-center gap-1.5 text-[0.63rem]">
              <g.icon className="h-3 w-3 shrink-0 text-accent" />
              <span className="truncate font-medium text-paper/80">{g.name}</span>
              <span className="tabular ml-auto shrink-0 text-paper/55">{Math.round(g.value * 100)}%</span>
            </div>
            <Bar value={g.value} delay={t0 + 0.5 + i * 0.12} slim />
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Progress so far against the steady line that finishes on time, with today
 * marked: a little ahead.
 */
function PaceChart({ t0 }: { t0: number }) {
  const fill = `tour-pace-${useId().replace(/:/g, "")}`;
  const done = "M10 160 C 40 146, 62 134, 82 122 S 124 94, 152 78 S 180 54, 190 46";
  return (
    <motion.div {...rise(t0 + 0.45, 8)} className="tour-only-tall flex min-h-0 flex-1 flex-col rounded-2xl bg-paper/[0.04] p-3">
      <div className="flex items-baseline justify-between gap-2 text-[0.6rem]">
        <span className="truncate font-semibold text-paper/80">Your pace</span>
        <motion.span {...pop(t0 + 1.9)} className="flex shrink-0">
          <Chip className="bg-positive/10 text-positive">4 days ahead</Chip>
        </motion.span>
      </div>
      <div className="relative mt-2 min-h-0 flex-1">
        <svg viewBox="0 0 300 172" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "rgb(var(--accent))", stopOpacity: 0.25 }} />
              <stop offset="1" style={{ stopColor: "rgb(var(--accent))", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {[40, 80, 120].map((y) => (
            <line key={y} x1="0" x2="300" y1={y} y2={y} className="stroke-paper/[0.06]" strokeWidth="1" />
          ))}
          <motion.line
            x1="10"
            y1="160"
            x2="290"
            y2="14"
            className="stroke-paper/30"
            strokeWidth="2"
            strokeDasharray="5 6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: t0 + 0.5, duration: 0.6 }}
          />
          <motion.text
            x="214"
            y="82"
            className="fill-paper/55 text-[11px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: t0 + 0.8, duration: 0.5 }}
          >
            On-time pace
          </motion.text>
          <line x1="190" x2="190" y1="12" y2="160" className="stroke-paper/15" strokeWidth="1.5" strokeDasharray="3 4" />
          <text x="190" y="171" textAnchor="middle" className="fill-paper/55 text-[11px]">
            Today
          </text>
          <motion.path
            d={`${done} L190 160 L10 160 Z`}
            fill={`url(#${fill})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: t0 + 1.5, duration: 0.8 }}
          />
          <motion.path
            d={done}
            fill="none"
            className="stroke-accent"
            strokeWidth="3.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: t0 + 0.7, duration: 1.2, ease: "easeInOut" }}
          />
          <motion.circle
            cx="190"
            cy="46"
            r="6.5"
            className="fill-accent"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: t0 + 1.85, type: "spring", stiffness: 500, damping: 16 }}
          />
        </svg>
      </div>
    </motion.div>
  );
}

function RoadmapDemo({ data, t0 }: DemoProps) {
  const activities = [`Revise ${data.topics[0]}`, "Two answer-writing sessions", "One full-length mock"];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <motion.div {...rise(t0, 4)} className="flex min-w-0 items-center gap-1 text-[0.58rem] font-medium text-paper/60">
        <span className="shrink-0">{new Date().getFullYear()}</span>
        <ChevronRight className="h-3 w-3 shrink-0 text-paper/35" />
        <span className="truncate">{data.monthName}</span>
        <ChevronRight className="h-3 w-3 shrink-0 text-paper/35" />
        <span className="shrink-0 font-semibold text-accent">This week</span>
      </motion.div>
      <ul className="space-y-1.5">
        {activities.map((a, i) => {
          const done = i < 2;
          const at = t0 + 0.5 + i * 0.45;
          return (
            <motion.li key={a} {...rise(t0 + 0.1 + i * 0.07, 6)} className="flex min-w-0 items-center gap-2 rounded-xl bg-paper/[0.04] px-2.5 py-1">
              <span className="relative grid h-4 w-4 shrink-0 place-items-center rounded-[0.3rem] border-2 border-paper/20">
                {done && (
                  <>
                    <motion.span
                      className="absolute -inset-0.5 rounded-[0.3rem] bg-accent"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: at, type: "spring", stiffness: 520, damping: 18 }}
                    />
                    <DrawnCheck delay={at + 0.08} className="relative h-2.5 w-2.5 text-accent-fg" />
                  </>
                )}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-[0.63rem] font-medium", done ? "text-paper/60" : "text-paper/85")}>{a}</span>
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", i === 2 ? "bg-danger" : "bg-warning")} />
            </motion.li>
          );
        })}
      </ul>
      <div className="mt-auto">
        <div className="flex items-baseline justify-between text-[0.58rem]">
          <span className="text-paper/55">Progress</span>
          <span className="font-semibold text-paper/80">2 of 3 done</span>
        </div>
        <Bar value={2 / 3} delay={t0 + 1.4} />
      </div>
    </div>
  );
}

function TimelineDemo({ t0 }: DemoProps) {
  const items = [
    { icon: Flag, title: "Started the preparation", meta: "Day 1" },
    { icon: Clock, title: "First 100 hours", meta: "Recorded for you" },
    { icon: BarChart3, title: "First full-length mock", meta: "Recorded for you" },
  ];
  return (
    <div className="relative flex h-full min-h-0 flex-col justify-center">
      <ul className="relative space-y-3">
        <motion.span
          className="absolute bottom-3 left-[0.94rem] top-3 w-px origin-top bg-paper/15"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: t0 + 0.2, duration: 1.2, ease: EASE_OUT }}
        />
        {items.map((it, i) => (
          <motion.li
            key={it.title}
            className="relative flex min-w-0 items-center gap-3"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: t0 + 0.35 + i * 0.3, duration: 0.55, ease: EASE_OUT }}
          >
            <span
              className={cn(
                "relative grid h-[1.9rem] w-[1.9rem] shrink-0 place-items-center rounded-full border",
                i === items.length - 1 ? "border-accent/40 bg-accent/10 text-accent" : "border-line bg-card text-paper/70",
              )}
            >
              <it.icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.68rem] font-semibold text-paper">{it.title}</p>
              <p className="truncate text-[0.56rem] text-paper/55">{it.meta}</p>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/* ── 5. Look back ────────────────────────────────────────────── */

function ReviewsDemo({ t0 }: DemoProps) {
  const hours = [5.5, 6, 4, 7, 6.5, 3, 6.5];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <Figure unit=" h" caption="this week, 7 active days">
          <CountUp to={38.5} delay={t0 + 0.3} duration={1.2} format={(n) => n.toFixed(1)} />
        </Figure>
        <motion.span {...pop(t0 + 1.2)} className="flex shrink-0">
          <Chip className="bg-positive/10 text-positive">
            <TrendingUp className="h-2.5 w-2.5" />
            4.5 h on last week
          </Chip>
        </motion.span>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-1.5">
        {hours.map((h, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="relative w-full flex-1">
              <motion.span
                className={cn(
                  "absolute inset-x-0 bottom-0 mx-auto block max-w-[1.4rem] rounded-md",
                  i === 3 ? "bg-accent" : "bg-accent/35",
                )}
                initial={{ height: "0%" }}
                animate={{ height: `${(h / 7) * 100}%` }}
                transition={{ delay: t0 + 0.25 + i * 0.06, duration: 0.8, ease: EASE_OUT }}
              />
            </div>
            <span className="text-[0.52rem] text-paper/50">{days[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiaryDemo({ t0 }: DemoProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <motion.span {...rise(t0, 4)} className="flex">
          <Chip className="bg-accent/10 text-accent">
            <Lock className="h-2.5 w-2.5" />
            Only you
          </Chip>
        </motion.span>
        <motion.span {...pop(t0 + 2.6)} className="flex items-center gap-1 text-[0.55rem] font-semibold text-positive">
          <Check className="h-2.5 w-2.5" />
          Saved
        </motion.span>
      </div>
      <p className="text-[0.74rem] font-semibold text-paper">
        <Typewriter text="A slow Tuesday" delay={t0 + 0.3} speed={18} />
      </p>
      <p className="text-[0.66rem] leading-snug text-paper/80">
        <Typewriter text="Economy was slow going, but I kept at it. Tomorrow starts with revision." delay={t0 + 0.9} speed={24} />
      </p>
      <div className="tour-hide-short mt-auto flex flex-wrap gap-1">
        {["Reflection", "economy"].map((t, i) => (
          <motion.span key={t} {...pop(t0 + 2.3 + i * 0.15)} className="flex">
            <Chip>{i ? `#${t}` : t}</Chip>
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function CoachDemo({ data, t0 }: DemoProps) {
  const tips = [
    { icon: Repeat, text: `Revise ${data.topics[0]} today. It's due.`, tone: "bg-accent/10 text-accent" },
    { icon: Clock, text: `${data.shortSubjects[1]} has had no hours this week.`, tone: "bg-warning/10 text-warning" },
    { icon: Moon, text: "Three short nights in a row. Sleep comes first.", tone: "bg-info/10 text-info" },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <p className="text-[0.58rem] text-paper/55">From your last seven days</p>
      {tips.map((tip, i) => (
        <motion.div
          key={tip.text}
          className={cn("flex min-w-0 items-start gap-2 rounded-xl border border-line bg-card p-2", i === 2 && "tour-hide-short")}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: t0 + 0.3 + i * 0.45, type: "spring", stiffness: 300, damping: 24 }}
        >
          <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md", tip.tone)}>
            <tip.icon className="h-3 w-3" />
          </span>
          <p className="min-w-0 text-[0.62rem] leading-snug text-paper/85">{tip.text}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ── 6. Make it yours ────────────────────────────────────────── */

function SearchDemo({ t0 }: DemoProps) {
  const mac = useMemo(isMac, []);
  const results = [
    { icon: Repeat, label: "Revision", short: "Spaced repetition" },
    { icon: CalendarCheck, label: "Reviews", short: "Weekly, monthly, yearly" },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-card px-2.5 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-paper/50" />
        <span className="min-w-0 flex-1 truncate text-[0.68rem] text-paper">
          <Typewriter text="rev" delay={t0 + 0.5} speed={170} />
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <span className="grid h-4 min-w-[1rem] place-items-center rounded border border-line px-1 text-[0.5rem] font-semibold text-paper/60">
            {mac ? <Command className="h-2.5 w-2.5" /> : "Ctrl"}
          </span>
          <span className="grid h-4 min-w-[1rem] place-items-center rounded border border-line px-1 text-[0.5rem] font-semibold text-paper/60">K</span>
        </span>
      </div>
      <ul className="space-y-1">
        {results.map((r, i) => (
          <motion.li
            key={r.label}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5",
              i === 0 && "bg-[var(--nav-active)] shadow-[inset_0_0_0_1px_var(--nav-active-ring)]",
            )}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: t0 + 1.1 + i * 0.08, duration: 0.4, ease: EASE_OUT }}
          >
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-md",
                i === 0 ? "bg-accent text-accent-fg" : "bg-accent/10 text-accent",
              )}
            >
              <r.icon className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.64rem] font-medium text-paper/90">{r.label}</span>
              <span className="tour-hide-short block truncate text-[0.54rem] text-paper/50">{r.short}</span>
            </span>
            {i === 0 && <CornerDownLeft className="h-3 w-3 shrink-0 text-paper/45" />}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function NotifyDemo({ data, t0 }: DemoProps) {
  const items = [
    { icon: Repeat, text: "4 revisions are due today", tone: "bg-accent/10 text-accent" },
    { icon: Flame, text: "Keep your 12-day streak: today isn't logged yet", tone: "bg-warning/10 text-warning" },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-paper/[0.05] text-paper/80">
          <Bell className="tour-bell h-4 w-4" style={{ animationDelay: `${t0 + 0.2}s` }} />
          <motion.span
            {...pop(t0 + 0.4)}
            className="absolute -right-1 -top-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-danger px-1 text-[0.5rem] font-bold text-card"
          >
            2
          </motion.span>
        </span>
        <span className="tour-hide-narrow ml-auto flex min-w-0">
          <Chip>
            <Moon className="h-2.5 w-2.5" />
            Quiet {data.clock("22:00")} to {data.clock("07:00")}
          </Chip>
        </span>
      </div>
      {items.map((n, i) => (
        <motion.div
          key={n.text}
          className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-card p-2"
          initial={{ opacity: 0, x: 26 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: t0 + 0.55 + i * 0.35, type: "spring", stiffness: 260, damping: 24 }}
        >
          <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md", n.tone)}>
            <n.icon className="h-3 w-3" />
          </span>
          <p className="min-w-0 text-[0.62rem] font-medium leading-snug text-paper/85">{n.text}</p>
        </motion.div>
      ))}
    </div>
  );
}

const MODE_ICON: Record<ThemeMode, typeof Sun> = { light: Sun, dark: Moon, lavender: Flower2 };

/** A theme in its own colours: the backdrop, a sidebar, a page and the accent. */
function MiniTheme({ mode, reduced }: { mode: ThemeMode; reduced: boolean }) {
  return (
    <span
      data-surface={surfaceFor(mode)}
      data-transparency={reduced ? "reduced" : undefined}
      aria-hidden
      className="relative flex aspect-[16/11] w-full gap-1 overflow-hidden rounded-lg border border-line bg-ink p-1"
    >
      <span className="app-backdrop absolute inset-0" />
      <span className="relative flex w-[24%] flex-col items-center gap-1 rounded-md border border-line bg-card py-1.5">
        <span className="block h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="block h-0.5 w-2/3 rounded-full bg-paper/30" />
        <span className="block h-0.5 w-2/3 rounded-full bg-paper/30" />
      </span>
      <span className="relative flex flex-1 flex-col justify-between rounded-md border border-line bg-card p-1.5 shadow-soft">
        <span className="block h-1 w-3/4 rounded-full bg-paper/70" />
        <span className="block h-0.5 w-full rounded-full bg-paper/30" />
        <span className="block h-1.5 w-1/2 rounded-full bg-accent" />
      </span>
    </span>
  );
}

/**
 * The real theme switch: picking one here changes the app, the tour
 * included, and saves it with the account, exactly as Settings does.
 */
function ThemesDemo({ t0 }: DemoProps) {
  const mode = useChronicle((s) => s.themeMode);
  const setThemeMode = useChronicle((s) => s.setThemeMode);
  const reduced = useChronicle((s) => s.reduceTransparency);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + THEME_MODES.length) % THEME_MODES.length;
    setThemeMode(THEME_MODES[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
        {THEME_MODES.map((m, i) => {
          const on = mode === m.id;
          const Icon = MODE_ICON[m.id];
          return (
            <motion.button
              key={m.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={(e) => {
                e.stopPropagation();
                setThemeMode(m.id);
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              {...rise(t0 + 0.1 + i * 0.08, 10)}
              className={cn(
                "relative flex min-w-0 flex-col gap-1.5 rounded-xl border p-1.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                on ? "border-accent ring-1 ring-accent/40" : "border-line hover:border-paper/30",
              )}
            >
              <MiniTheme mode={m.id} reduced={reduced} />
              <span className="flex min-w-0 items-center gap-1 px-0.5 text-[0.64rem] font-semibold text-paper">
                <Icon className="h-3 w-3 shrink-0" />
                <span className="truncate">{m.label}</span>
              </span>
              {on && (
                <motion.span
                  key={`on-${m.id}`}
                  {...pop(0)}
                  className="absolute right-2.5 top-2.5 grid h-4 w-4 place-items-center rounded-full bg-accent text-accent-fg"
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
      <p className="tour-hide-short text-center text-[0.58rem] text-paper/55">Try one: everything changes with it.</p>
    </div>
  );
}

function InstallDemo({ t0 }: DemoProps) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3">
      <div className="flex items-end justify-center gap-2.5">
        {/* A laptop… */}
        <motion.div {...rise(t0 + 0.1, 10)} className="flex flex-col items-center">
          <span className="relative block h-12 w-[4.6rem] rounded-md border-2 border-paper/25 bg-paper/[0.04] p-1">
            <ScreenLines delay={t0 + 0.4} />
          </span>
          <span className="block h-1 w-[5.6rem] rounded-b-md bg-paper/25" />
        </motion.div>
        {/* …the same chronicle travelling between them… */}
        <span className="tour-dash relative mb-6 block h-px w-10">
          {[0, 1, 2].map((i) => (
            <span key={i} className="tour-travel" style={{ animationDelay: `${t0 + 0.6 + i * 0.5}s` }} />
          ))}
        </span>
        {/* …and a phone. */}
        <motion.span {...rise(t0 + 0.2, 10)} className="relative mb-0.5 block h-14 w-8 rounded-lg border-2 border-paper/25 bg-paper/[0.04] p-1">
          <ScreenLines delay={t0 + 1.2} compact />
        </motion.span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <motion.span {...pop(t0 + 1.6)} className="flex">
          <Chip className="bg-positive/10 text-positive">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
            Synced just now
          </Chip>
        </motion.span>
        <motion.span {...pop(t0 + 1.8)} className="tour-hide-narrow flex">
          <Chip>
            <WifiOff className="h-2.5 w-2.5" />
            Works offline
          </Chip>
        </motion.span>
      </div>
    </div>
  );
}

/** A screen's worth of content, filling in. */
function ScreenLines({ delay, compact }: { delay: number; compact?: boolean }) {
  return (
    <span className="flex h-full flex-col justify-center gap-[3px]">
      <motion.span
        className="block h-1 rounded-full bg-accent"
        initial={{ width: 0 }}
        animate={{ width: compact ? "80%" : "55%" }}
        transition={{ delay, duration: 0.6, ease: EASE_OUT }}
      />
      {[0.9, 0.7].map((w, i) => (
        <motion.span
          key={i}
          className="block h-0.5 rounded-full bg-paper/30"
          initial={{ width: 0 }}
          animate={{ width: `${w * 100}%` }}
          transition={{ delay: delay + 0.15 + i * 0.1, duration: 0.6, ease: EASE_OUT }}
        />
      ))}
    </span>
  );
}

export const DEMOS: Record<DemoId, (props: DemoProps) => JSX.Element> = {
  journal: JournalDemo,
  habits: HabitsDemo,
  life: LifeDemo,
  library: LibraryDemo,
  revision: RevisionDemo,
  mistakes: MistakesDemo,
  current: CurrentDemo,
  subjects: SubjectsDemo,
  heatmap: HeatmapDemo,
  mocks: MocksDemo,
  graph: GraphDemo,
  goals: GoalsDemo,
  roadmap: RoadmapDemo,
  timeline: TimelineDemo,
  reviews: ReviewsDemo,
  diary: DiaryDemo,
  coach: CoachDemo,
  search: SearchDemo,
  notify: NotifyDemo,
  themes: ThemesDemo,
  install: InstallDemo,
};
