"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { track } from "@/components/marketing/analytics";
import { SR_INTERVALS } from "@/lib/revision";

/* ════════════════════════════════════════════════════════════════
   SPACED REVISION CALCULATOR
   Six revisions, each gap longer than the last: 1, 3, 7, 14, 30 and 60
   days, every gap counted from the revision before. It is the app's own
   ladder (SR_INTERVALS in lib/revision.ts), so the two cannot drift apart.
   Everything runs in the browser; nothing is stored or sent.
   ════════════════════════════════════════════════════════════════ */

const GAPS = SR_INTERVALS;

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const pretty = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** Escapes text for an iCalendar property value (RFC 5545 §3.3.11). */
function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line to 75 octets, as RFC 5545 asks. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

function buildIcs(topic: string, dates: string[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const title = topic.trim() ? `Revise: ${topic.trim()}` : "Revise today's topic";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DoOrDie//Spaced revision calculator//EN",
    "CALSCALE:GREGORIAN",
    ...dates.flatMap((d, i) => [
      "BEGIN:VEVENT",
      `UID:${d}-${i + 1}-${Math.random().toString(36).slice(2, 10)}@doordie`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDays(d, 1).replace(/-/g, "")}`,
      fold(`SUMMARY:${icsText(`${title} (revision ${i + 1} of ${dates.length})`)}`),
      fold(`DESCRIPTION:${icsText("Recall it before you reread it. If it didn't come back, start the schedule again from today.")}`),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function RevisionCalculator() {
  const [topic, setTopic] = useState("");
  const [studied, setStudied] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setStudied(todayInIndia()), []);

  const dates = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(studied)) return [];
    const out: string[] = [];
    let at = studied;
    for (const gap of GAPS) {
      at = addDays(at, gap);
      out.push(at);
    }
    return out;
  }, [studied]);

  const dayNumber = (iso: string) =>
    Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${studied}T00:00:00Z`)) / 86_400_000);

  function download() {
    const blob = new Blob([buildIcs(topic, dates)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revision-${(topic.trim() || "topic").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    track("tool_use", { tool: "revision_calculator", action: "download_ics" });
  }

  async function copy() {
    const text = [
      topic.trim() ? `Revision dates for ${topic.trim()}` : "Revision dates",
      ...dates.map((d, i) => `${i + 1}. ${pretty(d)} (day ${dayNumber(d)})`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      track("tool_use", { tool: "revision_calculator", action: "copy" });
    } catch {
      /* clipboard blocked: the dates are on screen anyway */
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-3xl border border-line bg-card p-6 shadow-soft sm:p-8">
        <h2 className="font-display text-xl font-bold tracking-tightest text-paper">Your topic</h2>
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="rc-topic" className="text-sm font-semibold text-paper">
              What did you study? <span className="font-normal text-paper/55">(optional)</span>
            </label>
            <input
              id="rc-topic"
              type="text"
              maxLength={80}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Fundamental Rights"
              className="mt-2 h-11 w-full rounded-xl border border-line bg-paper/[0.03] px-3.5 text-base text-paper outline-none placeholder:text-paper/35 focus:border-accent/55 focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label htmlFor="rc-date" className="text-sm font-semibold text-paper">
              When did you study it?
            </label>
            <input
              id="rc-date"
              type="date"
              value={studied}
              onChange={(e) => setStudied(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-line bg-paper/[0.03] px-3.5 text-base text-paper outline-none focus:border-accent/55 focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-paper/55">
          Each revision&apos;s gap is counted from the one before. If a topic doesn&apos;t come back at any revision,
          start again with today as the study date.
        </p>
      </div>

      <div className="rounded-3xl border border-line bg-card p-6 shadow-lift sm:p-8">
        <h2 className="font-display text-xl font-bold tracking-tightest text-paper">Revision dates</h2>
        {dates.length === 0 ? (
          <p className="mt-4 text-sm text-paper/60">Choose the date you studied the topic.</p>
        ) : (
          <>
            <ol className="mt-5 space-y-2" aria-live="polite">
              {dates.map((d, i) => (
                <li
                  key={d}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper/[0.03] px-4 py-3"
                >
                  <span className="flex items-center gap-3">
                    <span className="tabular grid h-7 w-7 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold text-paper">{pretty(d)}</span>
                  </span>
                  <span className="tabular text-xs text-paper/55">
                    {GAPS[i]} {GAPS[i] === 1 ? "day" : "days"} later · day {dayNumber(d)}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <button
                onClick={download}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg shadow-accent hover:brightness-[1.08]"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden /> Add to calendar (.ics)
              </button>
              <button
                onClick={copy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-card px-5 text-sm font-semibold text-paper hover:border-paper/25"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? "Copied" : "Copy the dates"}
              </button>
            </div>
            <p className="mt-3 text-xs text-paper/55">
              The calendar file works with Google Calendar, Apple Calendar and Outlook: open it, or import it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
