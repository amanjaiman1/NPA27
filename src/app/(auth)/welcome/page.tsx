"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NotebookPen, Repeat, HeartPulse, Lock, ArrowRight } from "lucide-react";
import { AuthMessage, queryParam } from "@/components/auth/auth-ui";

const FEATURES = [
  { icon: NotebookPen, title: "Every study day, on the record", body: "Hours, subjects, topics, mood and the lessons of the day." },
  { icon: Repeat, title: "Revision that schedules itself", body: "Spaced repetition, a mistake notebook and mock analytics that talk to each other." },
  { icon: HeartPulse, title: "The person behind the preparation", body: "Sleep, habits, reflections and reviews, next to the numbers they affect." },
];

export default function WelcomePage() {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (queryParam("deleted") === "1") setNotice("Your account and its data have been deleted.");
  }, []);

  return (
    <div className="space-y-5">
      {notice && <AuthMessage tone="success">{notice}</AuthMessage>}
      <div className="rounded-3xl border border-line bg-card p-6 shadow-lift sm:p-7">
        <h1 className="font-display text-2xl font-bold leading-tight tracking-tightest text-paper">
          A personal operating system for the UPSC journey.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-paper/55">
          Document every day of preparation, from day one to the final list.
        </p>
        <ul className="mt-6 space-y-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/[0.12] text-accent">
                <f.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-paper">{f.title}</span>
                <span className="block text-xs leading-relaxed text-paper/55">{f.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-col gap-2.5">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[0.95rem] font-semibold tracking-snugg text-accent-fg shadow-accent transition-all hover:-translate-y-px hover:brightness-[1.08]"
          >
            Create your account <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-full border border-line bg-card px-6 text-[0.95rem] font-semibold tracking-snugg text-paper shadow-soft transition-all hover:-translate-y-px hover:border-paper/25"
          >
            I already have an account
          </Link>
        </div>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-paper/45">
        <Lock className="h-3.5 w-3.5" /> Your chronicle is private. No one else can see it.
      </p>
    </div>
  );
}
