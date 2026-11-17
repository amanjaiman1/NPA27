import type { MetadataRoute } from "next";
import { INDEXABLE, absoluteUrl } from "@/lib/seo/config";

/**
 * Production: crawl everything except the API. The app's own pages stay
 * crawlable on purpose, so crawlers can see their noindex tag; blocking them
 * here would hide that tag and could still leave bare URLs in results.
 * Privacy is enforced by sign-in and the database, never by this file.
 *
 * Previews and local builds: crawl nothing.
 */
export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
