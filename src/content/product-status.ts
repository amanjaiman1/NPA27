/* ════════════════════════════════════════════════════════════════
   WHAT'S IN DOORDIE TODAY
   The status of each part of the product, for the Trust Center and the
   home page. Every module here is in the product now and open to every
   account: lib/features.ts has one access provider and it grants every
   feature to everyone.

   When something goes into beta, starts being built or is decided on,
   add it here with that status, and say so in the changelog when it ships.
   The pages show this list and nothing else, so nothing appears as
   "planned" that hasn't been decided.
   ════════════════════════════════════════════════════════════════ */

import { FEATURES, type FeatureKey } from "@/lib/features";

export type ProductStatus = "available" | "beta" | "in_development" | "planned";

export const PRODUCT_STATUS: Record<ProductStatus, { label: string; meaning: string }> = {
  available: { label: "Available", meaning: "In the product for every account, today." },
  beta: { label: "Beta", meaning: "In the product, but still changing, and may have rough edges." },
  in_development: { label: "In development", meaning: "Being built. Not in the product yet." },
  planned: { label: "Planned", meaning: "Decided on, but not started. Plans can change." },
};

export const PRODUCT_STATUS_ORDER: ProductStatus[] = ["available", "beta", "in_development", "planned"];

export interface ProductModule {
  key: FeatureKey;
  name: string;
  status: ProductStatus;
  /** One line on what it does, from the features page. */
  summary: string;
}

const entry = (key: FeatureKey, status: ProductStatus, summary: string): ProductModule => ({
  key,
  name: FEATURES[key].label,
  status,
  summary,
});

export const PRODUCT_MODULES: ProductModule[] = [
  entry("journal", "available", "One entry a day: hours by subject, topics, revisions, mocks, books, mood and notes."),
  entry("dashboard", "available", "The state of your preparation on one screen."),
  entry("subjects", "available", "Every paper's syllabus, topic by topic, from untouched to mastered."),
  entry("revision", "available", "Spaced revisions at growing gaps, with what's overdue and due next."),
  entry("mistakes", "available", "Wrong answers, why they went wrong, and when to try them again."),
  entry("mocks", "available", "Mock tests section by section: scores, accuracy, negative marking and time."),
  entry("roadmap", "available", "Yearly, monthly and weekly plans you write yourself."),
  entry("goals", "available", "Goals that measure themselves from your records."),
  entry("habits", "available", "Habits that fill in from what you log, and ones you tick off."),
  entry("coach", "available", "A daily briefing and suggestions from fixed rules, run in your browser."),
  entry("performanceReview", "available", "A look back at any period, with the figures gathered for you."),
  entry("life", "available", "Sleep, exercise, screen time and the rest, only what you choose to track."),
  entry("heatmap", "available", "A year of days shaded by hours studied, with streaks."),
  entry("currentAffairs", "available", "News notes with sources and tags, linked to the syllabus."),
  entry("library", "available", "Standard books for each paper, with page progress."),
  entry("knowledgeGraph", "available", "How syllabus topics connect across subjects."),
  entry("diary", "available", "A private place to write. It feeds nothing else."),
];

/** How many modules have each status, for the summary line. */
export function statusCounts(modules: ProductModule[] = PRODUCT_MODULES): Record<ProductStatus, number> {
  const out: Record<ProductStatus, number> = { available: 0, beta: 0, in_development: 0, planned: 0 };
  for (const m of modules) out[m.status] += 1;
  return out;
}
