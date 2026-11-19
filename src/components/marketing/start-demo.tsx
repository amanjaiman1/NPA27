"use client";

/* The button that opens the interactive demo: it switches demo mode on for
   this tab (lib/demo/mode.ts) and opens the dashboard with a full page load,
   so the app starts from nothing and loads the sample account. No account,
   no storage, no request to the server beyond the page itself. */

import { useEffect, useState } from "react";
import { ArrowRight, PlayCircle } from "lucide-react";
import { enterDemo } from "@/lib/demo/mode";
import { cn } from "@/lib/utils";

export function StartDemo({ className, label = "Start the demo" }: { className?: string; label?: string }) {
  const [starting, setStarting] = useState(false);
  return (
    <button
      type="button"
      data-track="demo_start"
      disabled={starting}
      onClick={() => {
        setStarting(true);
        enterDemo();
        window.location.assign("/dashboard");
      }}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[0.95rem] font-semibold tracking-snugg text-accent-fg shadow-accent transition-all duration-200 ease-out hover:-translate-y-px hover:brightness-[1.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:opacity-70",
        className,
      )}
    >
      <PlayCircle className="h-5 w-5" aria-hidden />
      {starting ? "Opening…" : label}
      {!starting && <ArrowRight className="h-4 w-4" aria-hidden />}
    </button>
  );
}

/** "You've left the demo", after Exit demo brings a visitor back here. */
export function LeftDemoNote() {
  const [left, setLeft] = useState(false);
  useEffect(() => setLeft(new URLSearchParams(window.location.search).get("left") === "1"), []);
  if (!left) return null;
  return (
    <p role="status" className="mb-6 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-paper/70 shadow-soft">
      You&apos;ve left the demo. Everything in it was discarded; start again whenever you like.
    </p>
  );
}
