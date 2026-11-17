/* ════════════════════════════════════════════════════════════════
   STRUCTURED DATA (JSON-LD)
   Builders for the schema.org types that genuinely describe this site.

   Deliberately absent:
   • ratings, reviews and user counts — there are none to report, and
     invented ones are against Google's policies. (Without a rating Google
     shows no software rich result; the markup still names the product.)
   • FAQPage — Google stopped showing FAQ rich results in May 2026. The
     FAQs stay on the pages for readers; they need no markup.

   The Organization and WebSite nodes are emitted on every public page by
   the marketing layout, so the `@id` references below always resolve on
   the page that uses them.
   ════════════════════════════════════════════════════════════════ */

import { SITE, absoluteUrl } from "./config";

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
    url: absoluteUrl("/"),
    description: SITE.description,
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "UPSC preparation tracker",
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
