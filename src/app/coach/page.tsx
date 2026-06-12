"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Sparkles, Send, Flame, TrendingUp, Layers, Moon } from "lucide-react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { PageHeader } from "@/components/ui/page-header";
import { Loading } from "@/components/ui/loading";
import { Card } from "@/components/ui/card";
import {
  currentStreak,
  longestStreak,
  hoursBySubject,
  subjectMastery,
  mockSeries,
  avgSleep,
} from "@/lib/selectors";
import { daysBetween, toISODate, round, avg, cn } from "@/lib/utils";

interface Msg {
  role: "user" | "coach";
  text: string;
}

export default function CoachPage() {
  const hydrated = useHasHydrated();
  const data = useChronicle((s) => s);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const insights = useMemo(() => {
    const streak = currentStreak(data.journal);
    const bySub14 = hoursBySubject(data.journal, data.subjects, 14).filter(
      (s) => data.subjects.find((x) => x.id === s.subjectId)?.topics.length,
    );
    const neglected = [...bySub14].sort((a, b) => a.hours - b.hours)[0];
    const series = mockSeries(data.mocks, "Prelims GS");
    const latest = series[series.length - 1];
    const prev = series[series.length - 2];
    const due = data.revisions.filter(
      (r) => r.nextDue <= toISODate(new Date()),
    ).length;
    const sleep = avgSleep(data.sleep, 14);
    return [
      {
        icon: Flame,
        title: "Consistency",
        body:
          streak > 0
            ? `You're on a ${streak}-day streak. Protect it — momentum is your biggest asset right now.`
            : "Your streak has broken. The fastest way back is a single 2-hour block today.",
      },
      {
        icon: TrendingUp,
        title: "Mock trend",
        body:
          latest && prev
            ? `Last Prelims GS mock: ${latest.pct}% (${latest.pct - prev.pct >= 0 ? "+" : ""}${latest.pct - prev.pct}% vs previous). ${latest.pct >= 50 ? "Above the safe zone." : "Keep grinding toward 50%+."}`
            : "Log a couple of mocks so I can read your trajectory.",
      },
      {
        icon: Layers,
        title: "Balance",
        body: neglected
          ? `${neglected.name} has had only ${round(neglected.hours, 1)}h in the last fortnight. A short revision block will keep it warm.`
          : "Your subject balance looks healthy across the last two weeks.",
      },
      {
        icon: Moon,
        title: "Recovery",
        body:
          sleep < 6.5
            ? `Avg sleep is ${sleep}h. Below 6.5h erodes retention — guard your sleep like a study slot.`
            : `Avg sleep is ${sleep}h. Good — rest is compounding in your favour.`,
        plus: due > 0 ? `${due} revision items are due.` : undefined,
      },
    ];
  }, [data]);

  const suggestions = [
    "What should I focus on this week?",
    "How are my mocks trending?",
    "Am I neglecting any subject?",
    "How is my consistency?",
    "What are my weakest topics?",
    "Am I on pace for the exam?",
  ];

  function generate(prompt: string): string {
    const p = prompt.toLowerCase();
    const today = toISODate(new Date());

    if (p.includes("focus")) {
      const bySub = hoursBySubject(data.journal, data.subjects, 14).filter(
        (s) => data.subjects.find((x) => x.id === s.subjectId)?.topics.length,
      );
      const neglected = [...bySub].sort((a, b) => a.hours - b.hours).slice(0, 2);
      const weakSub = [...data.subjects]
        .map((s) => ({ name: s.name, m: subjectMastery(s) }))
        .sort((a, b) => a.m - b.m)[0];
      const due = data.revisions.filter((r) => r.nextDue <= today).length;
      return `Here's where I'd point your energy this week:\n\n• Revive ${neglected.map((n) => n.name).join(" and ")} — they've been quiet lately.\n• ${weakSub.name} is your lowest-confidence subject (${weakSub.m}%). One deep session could lift it meaningfully.\n• Clear the ${due} revision item${due === 1 ? "" : "s"} due — spaced recall beats fresh reading right now.\n\nKeep one mock in the calendar to pressure-test it all.`;
    }

    if (p.includes("mock")) {
      const series = mockSeries(data.mocks, "Prelims GS");
      if (series.length < 2) return "Log at least two mocks and I'll chart your trajectory.";
      const latest = series[series.length - 1];
      const best = series.reduce((m, s) => (s.pct > m.pct ? s : m), series[0]);
      const first3 = avg(series.slice(0, 3).map((s) => s.pct));
      const last3 = avg(series.slice(-3).map((s) => s.pct));
      const delta = round(last3 - first3, 0);
      return `Across ${series.length} Prelims GS mocks:\n\n• Latest: ${latest.pct}%  |  Best: ${best.pct}%\n• Recent average is ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)}% versus your early mocks.\n\n${delta >= 0 ? "The trendline is your friend — trust the process." : "Dip noticed. Review the mistakes, not just the scores."}`;
    }

    if (p.includes("neglect") || p.includes("balance") || p.includes("subject")) {
      const bySub = hoursBySubject(data.journal, data.subjects, 21).filter(
        (s) => data.subjects.find((x) => x.id === s.subjectId)?.topics.length,
      );
      const sorted = [...bySub].sort((a, b) => a.hours - b.hours);
      const low = sorted.slice(0, 3);
      const high = sorted[sorted.length - 1];
      return `Over the last 3 weeks:\n\n• Least time: ${low.map((s) => `${s.name} (${round(s.hours, 1)}h)`).join(", ")}.\n• Most time: ${high.name} (${round(high.hours, 1)}h).\n\nRotate one neglected subject into tomorrow's plan to keep the whole syllabus alive.`;
    }

    if (p.includes("consist") || p.includes("streak")) {
      const streak = currentStreak(data.journal);
      const longest = longestStreak(data.journal);
      const cutoff = toISODate(new Date(Date.now() - 30 * 86400000));
      const active = data.journal.filter(
        (e) => e.date >= cutoff && e.totalHours > 0,
      ).length;
      return `Consistency snapshot:\n\n• Current streak: ${streak} days (best ever: ${longest}).\n• You studied ${active} of the last 30 days.\n\n${active >= 24 ? "Elite consistency. This is exactly how it's done." : "Aim for 25+ active days a month — consistency compounds harder than intensity."}`;
    }

    if (p.includes("weak") || p.includes("topic")) {
      const topics = data.subjects.flatMap((s) =>
        s.topics.map((t) => ({ name: t.name, sub: s.name, c: t.confidence })),
      );
      const weak = topics.sort((a, b) => a.c - b.c).slice(0, 5);
      return `Your five lowest-confidence topics:\n\n${weak
        .map((t, i) => `${i + 1}. ${t.name} — ${t.sub} (${t.c}%)`)
        .join("\n")}\n\nQueue these for revision; small confidence gains here move the needle most.`;
    }

    if (p.includes("pace") || p.includes("exam") || p.includes("ready")) {
      const daysLeft = daysBetween(today, data.profile.examDate);
      const cutoff = toISODate(new Date(Date.now() - 30 * 86400000));
      const recent = data.journal.filter((e) => e.date >= cutoff);
      const perDay = round(
        avg(recent.map((e) => e.totalHours)),
        1,
      );
      const projected = Math.round(perDay * daysLeft);
      return `${daysLeft} days to ${data.profile.targetExam}.\n\n• Recent pace: ~${perDay}h on active days.\n• At this rate, roughly ${projected.toLocaleString()} more focused hours remain before the exam.\n\nThat's plenty — if it's spent on revision and mocks, not endless first-reading.`;
    }

    return "I can read your journal, mocks, subjects, revision queue, and wellbeing. Ask about focus, mock trends, neglected subjects, consistency, weak topics, or exam pace.";
  }

  function send(prompt: string) {
    const text = prompt.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setTyping(true);
    const answer = generate(text);
    setTimeout(() => {
      setMessages((m) => [...m, { role: "coach", text: answer }]);
      setTyping(false);
    }, 550);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  if (!hydrated) return <Loading />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="AI Study Coach"
        title="A mentor who has read every page of your journal."
        description="Your coach reads your data — hours, mocks, revision, sleep — and turns it into guidance. Honest, specific, always in your corner."
      />

      {/* Insight cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {insights.map((ins) => (
          <Card key={ins.title} className="p-5">
            <div className="flex items-center gap-2 text-paper/45">
              <ins.icon className="h-4 w-4" />
              <span className="text-[0.7rem] font-medium uppercase tracking-wider">
                {ins.title}
              </span>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-paper/65">
              {ins.body}
            </p>
            {"plus" in ins && ins.plus && (
              <p className="mt-2 text-xs font-medium text-paper/80">{ins.plus}</p>
            )}
          </Card>
        ))}
      </div>

      {/* Chat */}
      <Card className="flex h-[520px] flex-col overflow-hidden">
        <div ref={scrollRef} className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-paper text-ink">
                <Sparkles className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-medium text-paper">
                Ask your coach anything
              </p>
              <p className="mt-1 max-w-xs text-xs text-paper/45">
                Every answer is computed from your real Chronicle data.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-3",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {m.role === "coach" && (
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-paper text-ink">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
              )}
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-paper text-ink"
                    : "border border-paper/10 bg-paper/[0.03] text-paper/80",
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-paper text-ink">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div className="flex items-center gap-1 rounded-2xl border border-paper/10 bg-paper/[0.03] px-4 py-3">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-paper/50"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* suggestions */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-paper/[0.06] px-4 py-3">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="shrink-0 rounded-full border border-paper/12 px-3 py-1.5 text-xs text-paper/60 transition-colors hover:border-paper/25 hover:text-paper"
            >
              {s}
            </button>
          ))}
        </div>

        {/* input */}
        <div className="flex items-center gap-2 border-t border-paper/[0.08] p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask about your preparation…"
            className="h-11 flex-1 rounded-xl border border-paper/10 bg-paper/[0.03] px-4 text-sm text-paper placeholder:text-paper/35 focus:border-paper/25 focus:outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-paper text-ink transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}
