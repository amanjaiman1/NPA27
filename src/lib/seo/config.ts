/* ════════════════════════════════════════════════════════════════
   SITE-WIDE SEO SETTINGS
   The canonical address, the brand, and whether this deployment may be
   indexed. Read on the server only (metadata, sitemap, robots, JSON-LD):
   `VERCEL_*` variables are not available in the browser, so importing
   SITE_URL into a client component would give a different answer there.
   Nothing in this file is secret.
   ════════════════════════════════════════════════════════════════ */

/** An origin like `https://example.com`, from a value with or without a scheme. */
function originOf(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
}

/**
 * The one address every canonical URL, sitemap entry and social card points
 * at. Set `NEXT_PUBLIC_SITE_URL` to the primary domain (the one that does not
 * redirect). Without it, Vercel's production domain is used: the shortest
 * custom domain, or the vercel.app one.
 */
export const SITE_URL =
  originOf(process.env.NEXT_PUBLIC_SITE_URL) ??
  originOf(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  "http://localhost:3000";

/**
 * Only the production deployment is indexed. Preview deployments and local
 * builds answer `noindex` everywhere and disallow crawling in robots.txt, so a
 * preview URL can never compete with the real site.
 */
export const INDEXABLE = process.env.VERCEL_ENV
  ? process.env.VERCEL_ENV === "production"
  : process.env.NODE_ENV === "production" && Boolean(process.env.NEXT_PUBLIC_SITE_URL);

export const SITE = {
  name: "DoOrDie",
  tagline: "Your UPSC preparation, documented",
  description:
    "DoOrDie is a free UPSC tracker for Civil Services preparation: a daily study journal, a topic-wise syllabus tracker, spaced revision, mock test analytics, goals and habits, in one private account.",
  locale: "en_IN",
  language: "en-IN",
  /** Square brand mark, used by Organization structured data. */
  logo: "/icons/icon-512.png?v=2",
  ogImage: {
    url: "/og/doordie.png",
    width: 1200,
    height: 630,
    alt: "DoOrDie, a free UPSC tracker, showing a study dashboard with hours, syllabus progress and revisions due",
  },
  /**
   * The only way the site gives to reach its owner, shown on the contact page
   * (which the privacy policy and terms point to). The site names no person
   * and links to no code host; use an address that is fine to publish.
   */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null,
  /** Google Search Console ownership token. Public by design; removing it un-verifies the site. */
  googleVerification: "VLuFtKkzlfkVgvIH-R34-EQzd3ntjZ5FjUffHpd-Sng",
  /** Bing Webmaster Tools token (`msvalidate.01`), when the owner adds one. */
  bingVerification: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim() || null,
} as const;

/** `/path` → `https://site/path`. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}
