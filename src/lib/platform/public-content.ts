/* ════════════════════════════════════════════════════════════════
   WHAT THE PUBLIC SITE SHOWS FROM THE PLATFORM
   Published reviews, published changelog entries, and the two settings
   the public pages need (the support address, where reviews appear).
   Read on the server with the public anon key, through the database's
   `platform_public_*` functions, which return published content only.

   Cached by Next for five minutes and tagged, so an administrator's
   change (or a student withdrawing consent) clears it at once through
   revalidateTag, and a busy page costs the database one call per five
   minutes at most. When Supabase isn't configured, or the platform
   migration hasn't been run, every function here answers "nothing" and
   the pages carry on without it.
   ════════════════════════════════════════════════════════════════ */

import type { ChangelogEntry, PublicReview, YouAskedItem } from "./types";

/** Cache tags, cleared by the routes that change what they cover. */
export const PUBLIC_TAGS = {
  testimonials: "platform-testimonials",
  site: "platform-site",
  changelog: "platform-changelog",
} as const;

const REVALIDATE_SECONDS = 300;

export interface PublicReviews {
  total: number;
  /** How many published reviews there must be before an average or a breakdown is shown. */
  minForAggregate: number;
  /** Null until `minForAggregate` reviews are published: one or two ratings say nothing. */
  averageRating: number | null;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number> | null;
  featureCounts: Record<string, number> | null;
  items: PublicReview[];
}

export interface PublicSite {
  supportEmail: string | null;
  /** The eligibility rule in force, null when it couldn't be read. */
  reviewRules: { minDays: number; minUsageDays: number } | null;
  /** What the badges need, null when it couldn't be read. */
  verification: { activeDays: number; establishedDays: number } | null;
  testimonials: { onHome: boolean; homeCount: number; onFeaturePages: boolean };
}

export interface PublicChangelog {
  total: number;
  items: Omit<ChangelogEntry, "body">[];
}

async function publicRpc<T>(fn: string, args: Record<string, string | number>, tag: string): Promise<T | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const query = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)])).toString();
  try {
    // GET, so PostgREST runs the (stable) function read-only, and Next can cache the answer.
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${fn}${query ? `?${query}` : ""}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS, tags: [tag] },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Published reviews, newest first, with the count of all of them and, once there are enough, their average. */
export async function getPublicReviews(limit = 24): Promise<PublicReviews> {
  const data = await publicRpc<PublicReviews>("platform_public_reviews", { p_limit: limit, p_offset: 0 }, PUBLIC_TAGS.testimonials);
  return {
    total: Number(data?.total ?? 0),
    minForAggregate: Number(data?.minForAggregate ?? 5),
    averageRating: data?.averageRating == null ? null : Number(data.averageRating),
    distribution: data?.distribution ?? null,
    featureCounts: data?.featureCounts ?? null,
    items: Array.isArray(data?.items) ? data.items.filter((r) => r && typeof r.slug === "string") : [],
  };
}

/** One published review by its address, or null (not published, withdrawn, or no such review). */
export async function getPublicReview(slug: string): Promise<PublicReview | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const data = await publicRpc<PublicReview | null>("platform_public_review", { p_slug: slug }, PUBLIC_TAGS.testimonials);
  return data && typeof data === "object" && "slug" in data ? data : null;
}

/** "You asked. We improved.": shipped changes with real feedback linked to them. */
export async function getYouAsked(limit = 12): Promise<YouAskedItem[]> {
  const data = await publicRpc<YouAskedItem[]>("platform_public_you_asked", { p_limit: limit }, PUBLIC_TAGS.changelog);
  return Array.isArray(data) ? data : [];
}

const SITE_DEFAULTS: PublicSite = {
  supportEmail: null,
  reviewRules: null,
  verification: null,
  testimonials: { onHome: true, homeCount: 3, onFeaturePages: true },
};

export async function getPublicSite(): Promise<PublicSite> {
  const data = await publicRpc<Partial<PublicSite>>("platform_public_site", {}, PUBLIC_TAGS.site);
  const t = data?.testimonials;
  const rules = data?.reviewRules;
  return {
    supportEmail: typeof data?.supportEmail === "string" && data.supportEmail ? data.supportEmail : null,
    reviewRules:
      rules && typeof rules.minDays === "number" && typeof rules.minUsageDays === "number"
        ? { minDays: rules.minDays, minUsageDays: rules.minUsageDays }
        : SITE_DEFAULTS.reviewRules,
    verification:
      data?.verification && typeof data.verification.activeDays === "number" && typeof data.verification.establishedDays === "number"
        ? { activeDays: data.verification.activeDays, establishedDays: data.verification.establishedDays }
        : SITE_DEFAULTS.verification,
    testimonials: {
      onHome: typeof t?.onHome === "boolean" ? t.onHome : SITE_DEFAULTS.testimonials.onHome,
      homeCount: typeof t?.homeCount === "number" ? t.homeCount : SITE_DEFAULTS.testimonials.homeCount,
      onFeaturePages: typeof t?.onFeaturePages === "boolean" ? t.onFeaturePages : SITE_DEFAULTS.testimonials.onFeaturePages,
    },
  };
}

/** Published changelog entries, newest first, without their full text. */
export async function getPublicChangelog(limit = 30): Promise<PublicChangelog> {
  const data = await publicRpc<PublicChangelog>("platform_public_changelog", { p_limit: limit, p_offset: 0 }, PUBLIC_TAGS.changelog);
  return { total: Number(data?.total ?? 0), items: Array.isArray(data?.items) ? data.items : [] };
}

/** One published entry by its address, or null (a draft, a future date, or no such entry). */
export async function getChangelogEntry(slug: string): Promise<ChangelogEntry | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const data = await publicRpc<ChangelogEntry | null>("platform_public_changelog_entry", { p_slug: slug }, PUBLIC_TAGS.changelog);
  return data && typeof data === "object" && "slug" in data ? data : null;
}
