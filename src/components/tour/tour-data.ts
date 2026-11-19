"use client";

import { useMemo } from "react";
import { useChronicle } from "@/lib/store";
import { dateFormat, daysBetween, toISODate } from "@/lib/utils";
import { formatClock, timeFormatOf } from "@/lib/sleep";

/**
 * What the tour's illustrations are drawn with: this account's own syllabus,
 * habits, books and exam, so the pictures show their subjects rather than
 * someone else's. Times and amounts in the pictures are examples; anything
 * stated as fact (the days left, the day of the journey) is real.
 */
export interface TourData {
  firstName: string;
  /** Up to six subject names, the core GS papers first. */
  subjects: string[];
  /** A short label for each of `subjects`, for the knowledge graph. */
  shortSubjects: string[];
  /** A topic from each of the first subjects. */
  topics: string[];
  habits: string[];
  books: { title: string; pages: number }[];
  daysLeft: number;
  journeyDay: number;
  exam: string;
  examShort: string;
  examYear: string;
  attempt: number;
  monthName: string;
  weekday: string;
  /** "11:30 PM" or "23:30", as this person reads times. */
  clock: (hhmm: string) => string;
}

/** The order the illustrations prefer, so the first subjects are familiar ones. */
const PREFERRED = ["polity", "economy", "modern-history", "geography", "environment", "ethics"];

const FALLBACK_SUBJECTS = ["Polity & Governance", "Economy", "Modern History", "Geography", "Environment & Ecology", "Ethics (GS4)"];
const FALLBACK_HABITS = ["Read the newspaper", "Answer writing", "Revise old notes"];
const FALLBACK_BOOKS = [
  { title: "Indian Polity", pages: 900 },
  { title: "Indian Economy", pages: 760 },
  { title: "Physical & Human Geography", pages: 430 },
];

/**
 * A subject's name for a small label: "Polity & Governance" is "Polity",
 * "Ethics (GS4)" is "Ethics", and a short name stays whole.
 */
function shortName(name: string): string {
  const plain = name.replace(/\s*\(.*\)\s*$/, "").trim();
  const first = plain.split(/\s+(?:&|and)\s+/i)[0];
  if (first.length <= 14) return first;
  return first.split(/\s+/)[0];
}

export function useTourData(): TourData {
  const profile = useChronicle((s) => s.profile);
  const subjects = useChronicle((s) => s.subjects);
  const habits = useChronicle((s) => s.habits);
  const books = useChronicle((s) => s.books);

  return useMemo(() => {
    const now = new Date();
    const today = toISODate(now);
    const ordered = [
      ...PREFERRED.map((id) => subjects.find((s) => s.id === id)).filter((s): s is (typeof subjects)[number] => Boolean(s)),
      ...subjects.filter((s) => !PREFERRED.includes(s.id)),
    ];
    const names = ordered.map((s) => s.name).slice(0, 6);
    const subjectNames = names.length >= 4 ? names : FALLBACK_SUBJECTS;
    const topics = ordered
      .slice(0, 4)
      .map((s) => s.topics[0]?.name)
      .filter((t): t is string => Boolean(t));
    const liveHabits = habits.filter((h) => !h.archived && h.cadence === "daily").map((h) => h.name);
    const format = timeFormatOf(profile);
    const exam = profile.targetExam || "UPSC CSE";
    const examYear = /\d{4}/.exec(profile.examDate ?? "")?.[0] ?? "";

    return {
      firstName: profile.name.trim().split(/\s+/)[0] ?? "",
      subjects: subjectNames,
      shortSubjects: subjectNames.map(shortName),
      topics: topics.length >= 2 ? topics : ["Fundamental Rights", "Money & Banking"],
      habits: liveHabits.length >= 2 ? liveHabits.slice(0, 3) : FALLBACK_HABITS,
      books: books.length >= 2 ? books.slice(0, 3).map((b) => ({ title: b.title, pages: b.totalPages || 400 })) : FALLBACK_BOOKS,
      daysLeft: profile.examDate ? Math.max(0, daysBetween(today, profile.examDate)) : 0,
      // The same count the dashboard greets you with.
      journeyDay: profile.startDate ? Math.max(1, daysBetween(profile.startDate, today)) : 1,
      exam,
      examShort: exam.replace(/^UPSC\s+/i, ""),
      examYear,
      attempt: profile.attemptNumber || 1,
      monthName: dateFormat("gb-month-long", "en-GB", { month: "long" }).format(now),
      weekday: dateFormat("gb-weekday-long", "en-GB", { weekday: "long" }).format(now),
      clock: (hhmm: string) => formatClock(hhmm, format),
    };
  }, [profile, subjects, habits, books]);
}
