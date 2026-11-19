/* ════════════════════════════════════════════════════════════════
   STRUCTURED DATA (JSON-LD)
   Builders for the schema.org types that genuinely describe this site.

   Ratings and reviews appear only on the reviews pages (reviewedApplication,
   reviewMarkup), only from reviews published there and visible on the page,
   and an aggregate only once enough are published (the same minimum the page
   uses before showing an average). Never on the Organization: Google treats
   a business's ratings of itself as self-serving.

   Deliberately absent:
   • user counts and any rating not worked out from published reviews.
   • FAQPage — Google stopped showing FAQ rich results in May 2026. The
     FAQs stay on the pages for readers; they need no markup.

   The Organization and WebSite nodes are emitted on every public page by
   the marketing layout, so the `@id` references below always resolve on
   the page that uses them.
   ════════════════════════════════════════════════════════════════ */

import { SITE, absoluteUrl } from "./config";
import { FILM } from "@/lib/film";

type Json = Record<string, unknown>;

export const ORGANIZATION_ID = absoluteUrl("/#organization");
export const WEBSITE_ID = absoluteUrl("/#website");
export const APP_ID = absoluteUrl("/#app");

export function siteGraph(): Json {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: SITE.name,
        url: absoluteUrl("/"),
        logo: { "@type": "ImageObject", url: absoluteUrl(SITE.logo), width: 512, height: 512 },
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: absoluteUrl("/"),
        name: SITE.name,
        alternateName: "DoOrDie UPSC Tracker",
        description: SITE.description,
        inLanguage: SITE.language,
        publisher: { "@id": ORGANIZATION_ID },
      },
    ],
  };
}

/** The product itself. Only facts: it is a free web app. */
export function softwareApplication(featureList: string[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": APP_ID,
    name: SITE.name,
    alternateName: "DoOrDie: Free UPSC Tracker",
    url: absoluteUrl("/"),
    description: SITE.description,
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "UPSC preparation tracker",
    keywords:
      "free UPSC tracker, UPSC preparation tracker, UPSC progress tracker, UPSC syllabus tracker, UPSC study planner, UPSC revision tracker, UPSC daily study tracker",
    operatingSystem: "Any device with a modern web browser",
    browserRequirements: "Requires JavaScript. Can be installed as an app from the browser.",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    featureList,
    inLanguage: SITE.language,
    screenshot: absoluteUrl("/product/dashboard.webp"),
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export interface MarkedReview {
  name: string;
  date: string;
  headline: string | null;
  body: string;
  rating: number;
  url?: string;
}

const reviewNode = (r: MarkedReview): Json => ({
  "@type": "Review",
  author: { "@type": "Person", name: r.name },
  datePublished: r.date.slice(0, 10),
  ...(r.headline ? { name: r.headline } : {}),
  reviewBody: r.body,
  reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
  ...(r.url ? { url: absoluteUrl(r.url) } : {}),
});

/**
 * The product with what its users wrote, for the reviews page. Pass the
 * aggregate only when the page shows one; the reviews must be the ones on
 * the page.
 */
export function reviewedApplication(aggregate: { average: number; count: number } | null, reviews: MarkedReview[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": APP_ID,
    name: SITE.name,
    url: absoluteUrl("/"),
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any device with a modern web browser",
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    ...(aggregate
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: aggregate.average, reviewCount: aggregate.count, bestRating: 5, worstRating: 1 } }
      : {}),
    ...(reviews.length ? { review: reviews.map(reviewNode) } : {}),
  };
}

/** One review on its own page, of the product. */
export function reviewMarkup(r: MarkedReview): Json {
  return {
    "@context": "https://schema.org",
    ...reviewNode(r),
    itemReviewed: {
      "@type": "WebApplication",
      "@id": APP_ID,
      name: SITE.name,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any device with a modern web browser",
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbList(crumbs: Crumb[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export function blogPosting(post: {
  path: string;
  title: string;
  description: string;
  published: string;
  updated: string;
  image?: string;
}): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": absoluteUrl(`${post.path}#article`),
    headline: post.title,
    description: post.description,
    datePublished: post.published,
    dateModified: post.updated,
    author: { "@type": "Organization", name: SITE.name, url: absoluteUrl("/about") },
    publisher: { "@id": ORGANIZATION_ID },
    image: [absoluteUrl(post.image ?? SITE.ogImage.url)],
    mainEntityOfPage: absoluteUrl(post.path),
    isPartOf: { "@id": WEBSITE_ID },
    inLanguage: SITE.language,
  };
}

/** The 58-second film that opens the home page, for video results. */
export function filmVideo(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: "DoOrDie in under a minute",
    description:
      "A 58-second film of DoOrDie, a free UPSC preparation tracker: logging a study day, syllabus progress, spaced revision, mock analytics, the Life Dashboard and the app's three themes, filmed with a sample account.",
    thumbnailUrl: [absoluteUrl(FILM.poster)],
    uploadDate: "2026-11-18",
    duration: `PT${FILM.seconds}S`,
    contentUrl: absoluteUrl(FILM.src),
    inLanguage: SITE.language,
    publisher: { "@id": ORGANIZATION_ID },
  };
}
