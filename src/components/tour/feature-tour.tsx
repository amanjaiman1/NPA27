"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo, type Variants } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, Compass, Hourglass } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/celebrate/confetti";
import { useMatchMedia } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { AnimatedMark, Aurora, CountUp, EASE_OUT, Kbd, TiltStage, WordReveal, rise, useFocusTrap, useReducedMotion } from "./kit";
import {
  CHAPTERS,
  CHOICES,
  FINALE_GLOW,
  INTRO_GLOW,
  ORBIT_INNER,
  ORBIT_OUTER,
  type Chapter,
  type Feature,
} from "./chapters";
import { DEMOS, INTERACTIVE_DEMOS } from "./demos";
import { useTourData, type TourData } from "./tour-data";

/* ════════════════════════════════════════════════════════════════
   THE FEATURE TOUR
   A full-screen layer that opens out of the Tour button: a welcome, six
   chapters with a live picture of every feature, and a last step that
   asks where to begin. Loaded only when it opens (tour-provider.tsx).

   Arrow keys, the step bar, Back and Next move between steps; Escape or
   "Skip tour" closes it. Inside a chapter one feature is in focus at a
   time; the focus moves on by itself every few seconds until you pick
   one, and pauses while the pointer rests on the pictures. On a phone the
   pictures come one at a time and a swipe moves through them, then on to
   the next chapter.

   While it's open the app behind is inert, so the keyboard and screen
   readers stay inside, and focus goes back where it was afterwards.
   ════════════════════════════════════════════════════════════════ */

const STEPS = ["Welcome", ...CHAPTERS.map((c) => c.label), "Where to start"];
const LAST = STEPS.length - 1;
/** How long each feature stays in focus before the next takes over. */
const AUTOPLAY_MS = 6000;
const SWIPE_OFFSET = 70;
const SWIPE_VELOCITY = 500;
const REVEAL_EASE = [0.65, 0, 0.35, 1] as const;

/**
 * How a chapter is laid out: the list beside every picture at once (a
 * computer), every picture above the list (a tall tablet), or one picture at
 * a time with a swipe (a phone, or any screen too short for the others).
 */
type Layout = "wide" | "roomy" | "single";

const SLIDE: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 56 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.65, ease: EASE_OUT } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -56, transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }),
};

const CARD: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 64, scale: 0.96 }),
  center: { opacity: 1, x: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 28 } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -64, scale: 0.96, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }),
};

export default function FeatureTour({ onClose }: { onClose: (destination?: string) => void }) {
  const data = useTourData();
  const reduce = useReducedMotion();
  const wide = useMatchMedia("(min-width: 1024px) and (min-height: 620px)");
  const roomy = useMatchMedia("(min-width: 640px) and (min-height: 900px)");
  const layout: Layout = wide ? "wide" : roomy ? "roomy" : "single";

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [announcement, setAnnouncement] = useState("");
  const stepRef = useRef(0);
  const closing = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [origin] = useState(findOrigin);

  const finish = useCallback(
    (destination?: string) => {
      if (closing.current) return;
      closing.current = true;
      onClose(destination);
    },
    [onClose],
  );

  const go = useCallback((to: number) => {
    if (closing.current) return;
    const target = Math.max(0, Math.min(LAST, to));
    const from = stepRef.current;
    if (target === from) return;
    stepRef.current = target;
    setDir(target > from ? 1 : -1);
    setStep(target);
    setAnnouncement(`Step ${target + 1} of ${STEPS.length}: ${STEPS[target]}`);
  }, []);
  const next = useCallback(() => go(stepRef.current + 1), [go]);
  const back = useCallback(() => go(stepRef.current - 1), [go]);

  useLockApp();
  useFocusTrap(rootRef, true);
  useTourKeys(next, back, finish);
  useStepFocus(rootRef, nextRef, step);

  const chapter = step > 0 && step < LAST ? CHAPTERS[step - 1] : null;
  const glow = chapter ? chapter.glow : step === 0 ? INTRO_GLOW : FINALE_GLOW;

  // The tour opens out of the Tour button as a widening circle, and closes
  // back into it, so it's clear where to find it again.
  const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y)) + 40;
  const circle = (r: number) => `circle(${r}px at ${origin.x}px ${origin.y}px)`;

  return createPortal(
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="DoOrDie feature tour"
      className="tour-root fixed inset-0 z-[95] flex flex-col overflow-hidden"
      initial={reduce ? { opacity: 0 } : { clipPath: circle(0) }}
      animate={
        reduce
          ? { opacity: 1, transition: { duration: 0.2 } }
          : { clipPath: circle(radius), transitionEnd: { clipPath: "none" }, transition: { duration: 0.85, ease: REVEAL_EASE } }
      }
      exit={
        reduce
          ? { opacity: 0, transition: { duration: 0.2 } }
          : { clipPath: [circle(radius), circle(0)], transition: { duration: 0.6, ease: REVEAL_EASE } }
      }
    >
      <Aurora spots={glow} />

      <header className="relative z-10 flex shrink-0 items-center gap-3 px-4 pb-1 pt-[max(env(safe-area-inset-top),0.85rem)] sm:px-8 sm:pt-6">
        <div className="flex min-w-0 items-center gap-2.5 sm:flex-1">
          <Logo className="h-7 w-7 shrink-0" />
          <span className="hidden font-brand text-[0.95rem] font-bold tracking-[-0.03em] text-paper sm:inline">DoOrDie</span>
          <span aria-hidden className="hidden h-4 w-px bg-paper/15 md:block" />
          <span className="hidden truncate text-[0.8rem] font-medium text-paper/60 md:inline">Feature tour</span>
        </div>
        <StepBar step={step} onPick={go} />
        <div className="flex shrink-0 justify-end sm:flex-1">
          <button
            type="button"
            onClick={() => finish()}
            className="lg-clear h-9 shrink-0 rounded-full px-3.5 text-[0.78rem] font-semibold text-paper/75 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
          >
            {step === LAST ? "Close" : "Skip tour"}
          </button>
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-1">
        <AnimatePresence custom={dir}>
          <motion.section
            key={step}
            data-tour-step={step}
            custom={dir}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            aria-labelledby={`tour-title-${step}`}
            className="no-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden"
          >
            {step === 0 ? (
              <Intro data={data} titleId={`tour-title-${step}`} onStart={next} onSkip={() => finish()} />
            ) : chapter ? (
              <ChapterView
                chapter={chapter}
                number={step}
                data={data}
                layout={layout}
                titleId={`tour-title-${step}`}
                onOpen={finish}
                onEdge={(d) => go(stepRef.current + d)}
              />
            ) : (
              <Finale titleId={`tour-title-${step}`} onChoose={finish} />
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {chapter && (
          <motion.footer
            key="footer"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="relative z-10 flex shrink-0 items-center gap-3 px-4 pb-[max(env(safe-area-inset-bottom),0.9rem)] pt-2 sm:px-8 sm:pb-6"
          >
            <Button variant="ghost" onClick={back} aria-label="Back" className="h-12 w-12 shrink-0 px-0 sm:h-11 sm:w-auto sm:px-5">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <p className="hidden flex-1 items-center justify-center gap-1.5 text-[0.74rem] text-paper/55 lg:flex">
              <Kbd label="Left arrow">
                <ArrowLeft className="h-3 w-3" aria-hidden />
              </Kbd>
              <Kbd label="Right arrow">
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Kbd>
              <span>to move</span>
              <span aria-hidden className="mx-1 text-paper/30">
                ·
              </span>
              <Kbd>Esc</Kbd>
              <span>to close</span>
            </p>
            <Button ref={nextRef} onClick={next} className="h-12 flex-1 sm:ml-auto sm:h-11 sm:flex-none sm:px-6 lg:ml-0">
              {step === LAST - 1 ? "Finish" : "Next"}
              {step === LAST - 1 ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </motion.footer>
        )}
      </AnimatePresence>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </motion.div>,
    document.body,
  );
}

/* ── behaviour ───────────────────────────────────────────────── */

/** Where the tour opens from: the Tour button on screen, or the middle. */
function findOrigin(): { x: number; y: number } {
  const button = Array.from(document.querySelectorAll<HTMLElement>("[data-tour-button]")).find(
    (b) => b.getClientRects().length > 0,
  );
  if (button) {
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.35 };
}

/**
 * While the tour is open the app behind it can't be reached: not by Tab, a
 * screen reader or the scroll wheel. Focus goes back where it was after.
 */
function useLockApp() {
  useEffect(() => {
    const app = document.querySelector<HTMLElement>(".app-root");
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    app?.setAttribute("inert", "");
    app?.setAttribute("aria-hidden", "true");
    return () => {
      document.body.style.overflow = overflow;
      app?.removeAttribute("inert");
      app?.removeAttribute("aria-hidden");
      if (before && before !== document.body && before.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
}

/**
 * The arrow keys move between steps and Escape closes. Arrows are left
 * alone where they already mean something (the theme choice, a field), and
 * the app's own shortcuts wait until the tour is closed.
 */
function useTourKeys(next: () => void, back: () => void, close: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='radiogroup']")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [next, back, close]);
}

/**
 * After a step change: the step on its way out stops taking focus, and if
 * focus was in it (or nowhere), it moves to the new step's main control, or
 * to Next.
 */
function useStepFocus(
  rootRef: React.RefObject<HTMLDivElement>,
  nextRef: React.RefObject<HTMLButtonElement>,
  step: number,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // A step brought straight back while it was still leaving is the same
    // element, so this has to be undone as well as done.
    root.querySelectorAll<HTMLElement>("[data-tour-step]").forEach((el) => {
      el.toggleAttribute("inert", el.dataset.tourStep !== String(step));
    });
    const id = window.requestAnimationFrame(() => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const holder = active?.closest<HTMLElement>("[data-tour-step]");
      if (active && root.contains(active) && (!holder || holder.dataset.tourStep === String(step))) return;
      const here = root.querySelector<HTMLElement>(`[data-tour-step="${step}"]`);
      const target =
        here?.querySelector<HTMLElement>("[data-tour-focus]") ?? nextRef.current ?? here?.querySelector<HTMLElement>("button, a[href]");
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [rootRef, nextRef, step]);
}

/* ── the step bar ────────────────────────────────────────────── */

function StepBar({ step, onPick }: { step: number; onPick: (i: number) => void }) {
  return (
    <nav aria-label="Tour steps" className="mx-auto flex shrink-0 items-center">
      {STEPS.map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(i)}
          aria-label={`Step ${i + 1} of ${STEPS.length}: ${label}`}
          aria-current={i === step ? "step" : undefined}
          className="flex h-8 items-center px-[3px] focus-visible:outline-none [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-accent/45"
        >
          <span
            className={cn(
              "relative block h-1.5 overflow-hidden rounded-full bg-paper/15 transition-[width] duration-500 ease-out",
              i === step ? "w-6 sm:w-10" : "w-3 sm:w-5",
            )}
          >
            <motion.span
              className="absolute inset-0 origin-left rounded-full bg-accent"
              initial={false}
              animate={{ scaleX: i <= step ? 1 : 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 30 }}
            />
          </span>
        </button>
      ))}
    </nav>
  );
}

/* ── the welcome ─────────────────────────────────────────────── */

function Intro({
  data,
  titleId,
  onStart,
  onSkip,
}: {
  data: TourData;
  titleId: string;
  onStart: () => void;
  onSkip: () => void;
}) {
  const title = data.firstName ? `Welcome to DoOrDie, ${data.firstName}.` : "Welcome to DoOrDie.";
  return (
    <div className="mx-auto grid min-h-full w-full max-w-6xl content-center items-center gap-6 px-5 py-5 sm:gap-10 sm:px-10 lg:grid-cols-2 lg:gap-14">
      <div className="order-2 text-center lg:order-1 lg:text-left">
        <motion.p
          {...rise(0.3, 8)}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-[0.75rem] font-medium text-paper/70 shadow-soft"
        >
          <Compass className="h-3.5 w-3.5 text-accent" />A quick tour
        </motion.p>
        <h2
          id={titleId}
          className="mt-4 text-balance font-display text-[1.95rem] font-bold leading-[1.08] tracking-tightest text-paper sm:text-[2.8rem] lg:text-[3.3rem]"
        >
          <WordReveal text={title} delay={0.4} />
        </h2>
        <motion.p
          {...rise(0.75, 10)}
          className="mx-auto mt-3 max-w-xl text-pretty text-[0.9rem] leading-relaxed text-paper/65 sm:mt-4 sm:text-base lg:mx-0"
        >
          Everything for your preparation lives here: each study day, the whole syllabus, your tests and your plans.
          Here&apos;s a quick look at what each part does.
        </motion.p>
        <motion.div {...rise(0.9, 10)} className="mt-5 flex flex-wrap justify-center gap-2 lg:justify-start">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[0.75rem] text-paper/70 shadow-soft">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span>
              Day <span className="font-semibold text-paper">{data.journeyDay}</span> of your preparation
            </span>
          </span>
          {data.daysLeft > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[0.75rem] text-paper/70 shadow-soft">
              <Hourglass className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span>
                <CountUp to={data.daysLeft} delay={1} duration={1.2} className="font-semibold text-paper" /> days to{" "}
                {data.examShort}
              </span>
            </span>
          )}
        </motion.div>
        <motion.div {...rise(1.05, 10)} className="mt-7 flex items-center justify-center gap-2.5 lg:justify-start">
          <Button size="lg" data-tour-focus onClick={onStart} className="tour-shine relative flex-1 overflow-hidden sm:flex-none">
            Show me around
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="subtle" onClick={onSkip} className="shrink-0 px-5">
            <span className="sm:hidden">Skip</span>
            <span className="hidden sm:inline">Skip the tour</span>
          </Button>
        </motion.div>
      </div>
      <div className="order-1 flex justify-center lg:order-2">
        <Constellation />
      </div>
    </div>
  );
}

/**
 * The DoOrDie mark drawing itself at the centre of two slow orbits, one icon
 * for each page of the app, bursting out from the middle into place.
 */
function Constellation() {
  return (
    <div
      aria-hidden
      className="relative my-3 aspect-square w-[min(15.5rem,62vw,28vh)] sm:my-5 sm:w-[min(22rem,54vw,34vh)] lg:my-0 lg:w-[min(28rem,38vw,58vh)]"
    >
      <div className="tour-halo absolute inset-[22%] rounded-full" />
      <Orbit icons={ORBIT_OUTER} inset="0%" delay={0.55} spin="tour-orbit" counter="tour-counter" />
      <Orbit icons={ORBIT_INNER} inset="20%" delay={0.35} spin="tour-orbit-rev" counter="tour-counter-rev" />
      <motion.div
        className="absolute inset-[37%] grid place-items-center rounded-full border border-line bg-card shadow-soft"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 16 }}
      >
        <AnimatedMark className="h-[64%] w-[64%]" delay={0.3} />
      </motion.div>
    </div>
  );
}

function Orbit({
  icons,
  inset,
  delay,
  spin,
  counter,
}: {
  icons: Chapter["icon"][];
  inset: string;
  delay: number;
  spin: string;
  counter: string;
}) {
  return (
    <motion.div
      className="absolute"
      style={{ inset }}
      initial={{ scale: 0.3, opacity: 0, rotate: -50 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ delay, type: "spring", stiffness: 60, damping: 15 }}
    >
      <div className={cn("absolute inset-0 rounded-full border border-dashed border-paper/15", spin)}>
        {icons.map((Icon, i) => {
          const a = (i / icons.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <span
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${50 + 50 * Math.cos(a)}%`, top: `${50 + 50 * Math.sin(a)}%` }}
            >
              <motion.span
                className="block"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: delay + 0.3 + i * 0.04, type: "spring", stiffness: 420, damping: 20 }}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-xl border border-line bg-card text-accent shadow-soft sm:h-10 sm:w-10 lg:h-11 lg:w-11",
                    counter,
                  )}
                >
                  <Icon className="h-[0.95rem] w-[0.95rem] lg:h-[1.15rem] lg:w-[1.15rem]" />
                </span>
              </motion.span>
            </span>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ── a chapter ───────────────────────────────────────────────── */

function ChapterView({
  chapter,
  number,
  data,
  layout,
  titleId,
  onOpen,
  onEdge,
}: {
  chapter: Chapter;
  number: number;
  data: TourData;
  layout: Layout;
  titleId: string;
  onOpen: (href: string) => void;
  /** Swiped past the first or last picture: the step before or after. */
  onEdge: (dir: 1 | -1) => void;
}) {
  const reduce = useReducedMotion();
  const features = chapter.features;
  const [pick, setPick] = useState(0);
  const [plays, setPlays] = useState<Record<string, number>>({});
  const [auto, setAuto] = useState(true);
  const [resting, setResting] = useState(false);
  const [swipe, setSwipe] = useState<1 | -1>(1);
  const feature = features[pick];

  const select = (i: number, by: "you" | "auto") => {
    if (by === "you") setAuto(false);
    setSwipe(i >= pick ? 1 : -1);
    setPick(i);
    setPlays((p) => ({ ...p, [features[i].id]: (p[features[i].id] ?? 0) + 1 }));
  };

  // Moves on by itself until a feature is picked, never past the last, and
  // not at all with Reduce motion. It waits while the pointer rests on the
  // pictures or the list: the bar stops, and so does the clock it keeps.
  const playing = auto && !reduce && pick < features.length - 1;
  const bar = playing ? (
    <span
      key={`${pick}-${plays[feature.id] ?? 0}`}
      aria-hidden
      className="tour-autoplay"
      style={{ animationDuration: `${AUTOPLAY_MS}ms` }}
      data-paused={resting ? "" : undefined}
      onAnimationEnd={() => select(pick + 1, "auto")}
    />
  ) : null;

  const rest = {
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && setResting(true),
    onPointerLeave: () => setResting(false),
  };

  const tile = (f: Feature, i: number) => ({
    feature: f,
    on: i === pick,
    data,
    demoKey: `${f.id}-${plays[f.id] ?? 0}`,
    // First appearance: one after another as the tiles arrive. Picked again:
    // straight away.
    t0: plays[f.id] ? 0.12 : 0.55 + i * 0.12,
    onPick: () => select(i, "you"),
  });

  if (layout === "wide") {
    return (
      <div className="mx-auto grid min-h-full w-full max-w-[86rem] grid-cols-[minmax(0,21rem)_minmax(0,1fr)] items-center gap-10 px-10 py-5 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] xl:gap-16 xl:px-14">
        <div className="min-w-0">
          <ChapterHead chapter={chapter} number={number} titleId={titleId} layout={layout} />
          <ul className="mt-6 space-y-1" {...rest}>
            {features.map((f, i) => {
              const on = i === pick;
              return (
                <motion.li key={f.id} className="relative" {...rise(0.45 + i * 0.07, 10)}>
                  {on && (
                    <motion.span
                      layoutId={`tour-pick-${chapter.id}`}
                      className="absolute inset-0 rounded-2xl border border-line bg-card shadow-soft"
                      transition={{ type: "spring", stiffness: 380, damping: 34 }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => select(i, "you")}
                    aria-pressed={on}
                    className="relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-300",
                        on ? "bg-accent text-accent-fg" : "bg-accent/10 text-accent",
                      )}
                    >
                      <f.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9rem] font-semibold text-paper">{f.name}</span>
                      <span className="block truncate text-[0.76rem] text-paper/55">{f.short}</span>
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: EASE_OUT }}
                        className="relative overflow-hidden"
                      >
                        <div className="pb-4 pl-[3.75rem] pr-4">
                          <p className="text-[0.8rem] leading-relaxed text-paper/70">{f.detail}</p>
                          {f.href && <OpenLink feature={f} onOpen={onOpen} className="mt-2" />}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {on && bar}
                </motion.li>
              );
            })}
          </ul>
        </div>
        <motion.div {...rise(0.2, 24)} {...rest}>
          <TiltStage enabled className="h-[min(31rem,62vh)]">
            <Bento chapter={chapter} tile={tile} />
          </TiltStage>
        </motion.div>
      </div>
    );
  }

  if (layout === "roomy") {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-5 px-8 py-5">
        <ChapterHead chapter={chapter} number={number} titleId={titleId} layout={layout} />
        <Chips features={features} pick={pick} onPick={(i) => select(i, "you")} bar={bar} />
        <motion.div {...rise(0.25, 20)} {...rest}>
          <TiltStage enabled={false} className="h-[min(30rem,46vh)]">
            <Bento chapter={chapter} tile={tile} />
          </TiltStage>
        </motion.div>
        <Detail feature={feature} onOpen={onOpen} />
      </div>
    );
  }

  const swipeTo = (d: 1 | -1) => {
    const i = pick + d;
    if (i < 0 || i >= features.length) onEdge(d);
    else select(i, "you");
  };

  return (
    <div className="flex min-h-full w-full flex-col gap-3.5 px-5 pb-3 pt-2 sm:mx-auto sm:max-w-xl sm:justify-center">
      <ChapterHead chapter={chapter} number={number} titleId={titleId} layout={layout} />
      <Chips features={features} pick={pick} onPick={(i) => select(i, "you")} bar={bar} />
      <motion.div
        className="relative h-[clamp(13rem,34vh,21rem)] shrink-0 touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.22}
        dragMomentum={false}
        onDragEnd={(_: unknown, info: PanInfo) => {
          if (info.offset.x < -SWIPE_OFFSET || info.velocity.x < -SWIPE_VELOCITY) swipeTo(1);
          else if (info.offset.x > SWIPE_OFFSET || info.velocity.x > SWIPE_VELOCITY) swipeTo(-1);
        }}
      >
        <AnimatePresence custom={swipe}>
          <motion.div
            key={feature.id}
            custom={swipe}
            variants={CARD}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0"
          >
            <Tile {...tile(feature, pick)} t0={plays[feature.id] ? 0.15 : 0.5} className="h-full" />
          </motion.div>
        </AnimatePresence>
      </motion.div>
      <div aria-hidden className="flex items-center justify-center gap-2 text-[0.68rem] text-paper/50">
        <span className="flex gap-1.5">
          {features.map((f, i) => (
            <span
              key={f.id}
              className={cn("block h-1.5 rounded-full transition-all duration-300", i === pick ? "w-4 bg-accent" : "w-1.5 bg-paper/20")}
            />
          ))}
        </span>
        <span>Swipe for more</span>
      </div>
      <Detail feature={feature} onOpen={onOpen} />
    </div>
  );
}

function ChapterHead({
  chapter,
  number,
  titleId,
  layout,
}: {
  chapter: Chapter;
  number: number;
  titleId: string;
  layout: Layout;
}) {
  const Icon = chapter.icon;
  return (
    <div className="min-w-0">
      <motion.p {...rise(0.1, 8)} className="flex items-center gap-2 text-[0.78rem] font-medium">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-semibold text-paper/80">{chapter.label}</span>
        <span className="text-paper/50">
          {number} of {CHAPTERS.length}
        </span>
      </motion.p>
      <h2
        id={titleId}
        className={cn(
          "text-balance font-display font-bold tracking-tightest text-paper",
          // The line height comes after the size: `cn` drops one that comes before.
          layout === "single"
            ? "mt-2.5 text-[1.6rem] leading-[1.1] sm:text-[2rem]"
            : "mt-3 text-[2.15rem] leading-[1.08] lg:text-[2.3rem] xl:text-[2.75rem]",
        )}
      >
        <WordReveal text={chapter.title} delay={0.15} />
      </h2>
      <motion.p
        {...rise(0.4, 8)}
        className={cn(
          "text-pretty text-paper/65",
          // On a short screen the lead gives way; each feature's own line says it.
          layout === "single" && "mt-2 text-[0.86rem] leading-relaxed [@media(max-height:780px)]:hidden",
          layout === "roomy" && "mt-3 text-[0.95rem] leading-relaxed [@media(max-height:820px)]:hidden",
          layout === "wide" && "mt-3 text-[0.95rem] leading-relaxed [@media(max-height:740px)]:hidden",
        )}
      >
        {chapter.lead}
      </motion.p>
    </div>
  );
}

/** The features of a chapter as a row of chips, for the narrower layouts. */
function Chips({
  features,
  pick,
  onPick,
  bar,
}: {
  features: Feature[];
  pick: number;
  onPick: (i: number) => void;
  bar: React.ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const mounted = useRef(false);

  // Keeps the chip in focus in view as the focus moves along.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const el = row.current;
    const chip = chips.current[pick];
    if (!el || !chip) return;
    el.scrollTo({ left: Math.max(0, chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2), behavior: "smooth" });
  }, [pick]);

  return (
    <motion.div {...rise(0.35, 8)} className="-mx-5 sm:mx-0">
      <div ref={row} className="no-scrollbar relative flex gap-2 overflow-x-auto px-5 py-0.5 sm:flex-wrap sm:px-0">
        {features.map((f, i) => {
          const on = i === pick;
          return (
            <button
              key={f.id}
              ref={(el) => {
                chips.current[i] = el;
              }}
              type="button"
              onClick={() => onPick(i)}
              aria-pressed={on}
              className={cn(
                "relative inline-flex h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-3.5 text-[0.78rem] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
                on ? "border-accent/40 bg-accent/15 text-accent" : "border-line text-paper/70 hover:text-paper",
              )}
            >
              <f.icon className="h-3.5 w-3.5" />
              {f.name}
              {on && bar}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

/** What the feature in focus does, and the way to it. */
function Detail({ feature, onOpen }: { feature: Feature; onOpen: (href: string) => void }) {
  return (
    <div className="min-h-[5.5rem]">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={feature.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          <p className="text-[0.88rem] leading-relaxed text-paper/70">
            <span className="font-semibold text-paper">{feature.name}.</span> {feature.detail}
          </p>
          {feature.href && <OpenLink feature={feature} onOpen={onOpen} className="mt-2" />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * A real link to the page, so it can be opened in a new tab too. An ordinary
 * click closes the tour and goes there.
 */
function OpenLink({ feature, onOpen, className }: { feature: Feature; onOpen: (href: string) => void; className?: string }) {
  const href = feature.href;
  if (!href) return null;
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen(href);
      }}
      className={cn(
        "group inline-flex items-center gap-1 rounded-md text-[0.82rem] font-semibold text-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        className,
      )}
    >
      Open {feature.name}
      <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  );
}

type TileProps = {
  feature: Feature;
  on: boolean;
  data: TourData;
  demoKey: string;
  t0: number;
  onPick: () => void;
};

/** Every picture of a chapter at once, on the chapter's own grid. */
function Bento({ chapter, tile }: { chapter: Chapter; tile: (f: Feature, i: number) => TileProps }) {
  return (
    <div
      className="grid h-full gap-3 p-3"
      style={{
        gridTemplateColumns: `repeat(${chapter.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${chapter.rows}, minmax(0, 1fr))`,
      }}
    >
      {chapter.features.map((f, i) => (
        <motion.div
          key={f.id}
          className="min-h-0 min-w-0"
          style={{ gridColumn: f.area.col, gridRow: f.area.row }}
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.25 + i * 0.09, duration: 0.65, ease: EASE_OUT }}
        >
          <Tile {...tile(f, i)} className="h-full" />
        </motion.div>
      ))}
    </div>
  );
}

/**
 * One feature's picture. The one in focus is lit, with light running round
 * its edge; the rest wait a little dimmer. Clicking one puts it in focus, and
 * clicking it again plays it again.
 */
function Tile({ feature, on, data, demoKey, t0, onPick, className }: TileProps & { className?: string }) {
  const Demo = DEMOS[feature.id];
  const interactive = INTERACTIVE_DEMOS.has(feature.id);
  const Icon = feature.icon;
  return (
    <motion.div
      onClick={onPick}
      className={cn(
        "tour-tile relative flex cursor-pointer flex-col overflow-hidden rounded-[1.35rem] border border-line bg-card p-3 shadow-soft",
        on && "is-on",
        className,
      )}
      initial={false}
      animate={{ opacity: on ? 1 : 0.5, scale: on ? 1 : 0.985 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
    >
      {on && <span aria-hidden className="tour-sweep" />}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors duration-300",
            on ? "bg-accent text-accent-fg" : "bg-accent/10 text-accent",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[0.72rem] font-semibold text-paper">{feature.name}</span>
      </div>
      <div className="relative mt-2.5 min-h-0 flex-1" aria-hidden={interactive ? undefined : true}>
        <Demo key={demoKey} data={data} t0={t0} />
      </div>
    </motion.div>
  );
}

/* ── the last step ───────────────────────────────────────────── */

function Finale({ titleId, onChoose }: { titleId: string; onChoose: (href?: string) => void }) {
  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center px-5 py-4 text-center sm:px-10 sm:py-6">
      <Confetti fire />
      <DoneBadge />
      <h2 id={titleId} className="mt-5 font-display text-[2rem] font-bold leading-[1.08] tracking-tightest text-paper sm:text-[2.8rem]">
        <WordReveal text="You're all set." delay={0.3} />
      </h2>
      <motion.p {...rise(0.6, 8)} className="mt-2 text-[0.95rem] text-paper/65 sm:text-base">
        Where would you like to start?
      </motion.p>
      <ul className="mt-6 grid w-full max-w-4xl grid-cols-2 gap-2.5 sm:mt-7 lg:grid-cols-3">
        {CHOICES.map((c, i) => (
          <motion.li key={c.title} {...rise(0.7 + i * 0.06, 14)}>
            <button
              type="button"
              data-tour-focus={i === 0 ? "" : undefined}
              onClick={() => onChoose(c.href)}
              className="group flex h-full w-full flex-col items-start gap-2.5 rounded-2xl border border-line bg-card p-3 text-left shadow-soft transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 sm:flex-row sm:items-center sm:gap-3 sm:p-3.5"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent transition-colors duration-300 group-hover:bg-accent group-hover:text-accent-fg">
                <c.icon className="h-[1.1rem] w-[1.1rem]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.84rem] font-semibold leading-snug text-paper sm:truncate sm:text-[0.9rem]">{c.title}</span>
                <span className="hidden text-[0.75rem] leading-snug text-paper/55 sm:block">{c.line}</span>
              </span>
              <ArrowRight className="hidden h-4 w-4 shrink-0 text-paper/35 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-accent sm:block" />
            </button>
          </motion.li>
        ))}
      </ul>
      <motion.p {...rise(1.2, 6)} className="mt-6 text-pretty text-[0.78rem] text-paper/55">
        <Compass className="mr-1.5 inline h-3.5 w-3.5 align-[-0.2em] text-accent" />
        Open the tour again any time from the compass at the top of the page.
      </motion.p>
    </div>
  );
}

/** A tick that draws itself in a disc, with a ring of light going out from it. */
function DoneBadge() {
  return (
    <div className="relative grid h-20 w-20 place-items-center">
      <motion.span
        className="absolute inset-0 rounded-full bg-accent/20"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 1.6], opacity: [0.7, 0] }}
        transition={{ delay: 0.55, duration: 1.4, ease: "easeOut" }}
      />
      <motion.span
        className="relative grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-fg shadow-accent"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 15 }}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden>
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.45, duration: 0.45, ease: EASE_OUT }}
          />
        </svg>
      </motion.span>
    </div>
  );
}
