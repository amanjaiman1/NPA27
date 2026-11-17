import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/config";
import { ALL_PAGES } from "@/lib/seo/pages";
import { POSTS, postPath } from "@/content/blog";

/**
 * Every public, indexable page, at its canonical address, with the date its
 * content last changed. The app, the sign-in screens and the API are not
 * listed: they are private and marked noindex.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...ALL_PAGES.map((p) => ({ url: absoluteUrl(p.path), lastModified: p.updated })),
    ...POSTS.map((p) => ({ url: absoluteUrl(postPath(p.slug)), lastModified: p.updated })),
  ];
}
