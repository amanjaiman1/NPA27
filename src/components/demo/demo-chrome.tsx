"use client";

/* What marks the interactive demo as the demo, on every page of it: a bar
   at the top of the page that says so and offers the way out, and the
   guide, seven stops through the real app (lib/demo/guide.ts). Both are
   rendered by the app shell only when the account's mode is "demo". */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Compass, FlaskConical, LogOut, Sparkles, UserPlus, X } from "lucide-react";
import { DEMO_STEPS } from "@/lib/demo/guide";
import { leaveDemo, readDemoStep, saveDemoStep } from "@/lib/demo/mode";
import { useChronicle } from "@/lib/store";
import { useAccount } from "@/components/account/account-session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DemoChromeValue {
  step: number;
  guideOpen: boolean;
  setGuideOpen: (open: boolean) => void;
  goTo: (step: number) => void;
  signUp: () => void;
  exit: () => void;
}

const DemoChromeContext = createContext<DemoChromeValue | null>(null);

function useDemoChrome(): DemoChromeValue {
  const ctx = useContext(DemoChromeContext);
  if (!ctx) throw new Error("useDemoChrome must be used within DemoChrome");
  return ctx;
}

/** Holds the guide's place and whether it's open, for the bar and the guide alike. */
export function DemoChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAccount();
  const [step, setStep] = useState(0);
  const [guideOpen, setGuideOpen] = useState(true);

  // Where the guide was, if the page was reloaded.
  useEffect(() => setStep(Math.min(readDemoStep(), DEMO_STEPS.length - 1)), []);

  const goTo = useCallback(
    (next: number) => {
      const n = Math.max(0, Math.min(DEMO_STEPS.length - 1, next));
      setStep(n);
      saveDemoStep(n);
      setGuideOpen(true);
      if (DEMO_STEPS[n].path !== pathname) router.push(DEMO_STEPS[n].path);
    },
    [pathname, router],
  );

  const value = useMemo<DemoChromeValue>(
    () => ({
      step,
      guideOpen,
      setGuideOpen,
      goTo,
      // A full load, with the demo switched off first, so sign-up starts clean.
      signUp: () => {
        leaveDemo();
        window.location.assign("/signup");
      },
      exit: () => void signOut(),
    }),
    [step, guideOpen, goTo, signOut],
  );

  return <DemoChromeContext.Provider value={value}>{children}</DemoChromeContext.Provider>;
}

/** The strip at the top of every page of the demo. */
export function DemoBar() {
  const { guideOpen, setGuideOpen, signUp, exit } = useDemoChrome();
  const name = useChronicle((s) => s.profile.name);
  return (
    <div
      role="region"
      aria-label="Demo"
      className="sticky top-0 z-20 -mx-1 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-accent/30 bg-card/95 px-3 py-2.5 shadow-soft backdrop-blur sm:px-4"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-accent-fg">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Demo
      </span>
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-paper/75 sm:text-[0.8rem]">
        <span className="font-semibold text-paper">{name ? `${name}’s sample account` : "A sample account"}, with made-up data.</span>{" "}
        <span className="hidden sm:inline">Change anything you like: nothing is saved, and it resets when you leave.</span>
        <span className="sm:hidden">Nothing you change is saved.</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {!guideOpen && (
          <Button variant="ghost" size="sm" onClick={() => setGuideOpen(true)}>
            <Compass className="h-3.5 w-3.5" aria-hidden /> Guide
          </Button>
        )}
        <Button size="sm" onClick={signUp}>
          <UserPlus className="h-3.5 w-3.5" aria-hidden /> Create free account
        </Button>
        <Button variant="ghost" size="sm" onClick={exit}>
          <LogOut className="h-3.5 w-3.5" aria-hidden /> Exit demo
        </Button>
      </div>
    </div>
  );
}

/** The room the open guide takes, so the page can scroll its last lines clear of it (see DemoGuideSpace). */
const GUIDE_SPACE = "--demo-guide-h";

/** Space at the end of the page as tall as the guide, so nothing stays hidden under it. */
export function DemoGuideSpace() {
  return <div aria-hidden className="shrink-0" style={{ height: `var(${GUIDE_SPACE}, 0px)` }} />;
}

/** The guide: one stop at a time, in the corner of the page, with room made for it below the page. */
export function DemoGuide() {
  const pathname = usePathname();
  const { step, guideOpen, setGuideOpen, goTo, signUp, exit } = useDemoChrome();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!guideOpen || !el) {
      root.style.removeProperty(GUIDE_SPACE);
      return;
    }
    const measure = () => root.style.setProperty(GUIDE_SPACE, `${el.offsetHeight + 16}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(GUIDE_SPACE);
    };
  }, [guideOpen, step]);

  if (!guideOpen) return null;
  const s = DEMO_STEPS[step];
  const last = step === DEMO_STEPS.length - 1;
  const here = pathname === s.path;

  return (
    <aside
      ref={ref}
      aria-label="Demo guide"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(var(--bottom-nav-h,0px)+0.75rem)] z-40 mx-auto max-w-md rounded-3xl border border-line bg-card p-4 shadow-lift sm:inset-x-auto sm:right-5 sm:w-[23rem] lg:bottom-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-accent">
          Guided tour · {step + 1} of {DEMO_STEPS.length}
        </p>
        <button
          type="button"
          onClick={() => setGuideOpen(false)}
          className="grid h-8 w-8 place-items-center rounded-full text-paper/55 transition-colors hover:bg-paper/[0.06] hover:text-paper"
          aria-label="Hide the guide"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ol className="mt-2 flex gap-1" aria-hidden>
        {DEMO_STEPS.map((x, i) => (
          <li key={x.path} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-paper/[0.1]")} />
        ))}
      </ol>
      <h2 className="mt-3 text-[0.98rem] font-semibold leading-snug tracking-snugg text-paper">{s.title}</h2>
      <p className="mt-1.5 text-[0.82rem] leading-relaxed text-paper/70">{s.body}</p>
      {here ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-accent/[0.08] px-3 py-2 text-[0.8rem] leading-relaxed text-paper/80">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span>
            <span className="font-semibold text-paper">Try it:</span> {s.tryIt}
          </span>
        </p>
      ) : (
        <Button variant="ghost" size="sm" className="mt-2.5" onClick={() => goTo(step)}>
          Go to {s.page} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}

      {last && (
        <div className="mt-3 rounded-2xl border border-accent/30 bg-accent/[0.06] p-3">
          <p className="text-sm font-semibold text-paper">That&apos;s the tour.</p>
          <p className="mt-1 text-[0.8rem] leading-relaxed text-paper/70">
            Your own account is free and starts empty. Nothing from the demo carries over, and your records stay private to you.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={signUp}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden /> Create your free account
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setGuideOpen(false)}>
              Keep exploring
            </Button>
            <Button variant="ghost" size="sm" onClick={exit}>
              Exit demo
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => goTo(step - 1)} disabled={step === 0}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
        </Button>
        {!last && (
          <Button size="sm" onClick={() => goTo(step + 1)}>
            Next: {DEMO_STEPS[step + 1].page} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </aside>
  );
}
