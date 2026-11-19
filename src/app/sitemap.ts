import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/config";
import { ALL_PAGES, PAGES } from "@/lib/seo/pages";
import { POSTS, postPath } from "@/content/blog";
import { getPublicChangelog } from "@/lib/platform/public-content";

/**
 * Every public, indexable page, at its canonical address, with the date its
 * content last changed. The app, the sign-in screens, the Admin Center and
 * the API are not listed: they are private and marked noindex. Published
 * changelog entries are read from the database (cached, see
 * lib/platform/public-content.ts); drafts never appear.
 *
 * Built on each request rather than stored: Next 14 doesn't clear a stored
 * route (as opposed to a page) when a cache tag is revalidated, so a stored
 * sitemap could miss a new entry for five minutes. The database answer it
 * uses is still cached and tagged, so this costs no extra database calls.
 */
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const changelog = await getPublicChangelog(100);
  return [
    ...ALL_PAGES.map((p) => ({ url: absoluteUrl(p.path), lastModified: p.updated })),
    ...POSTS.map((p) => ({ url: absoluteUrl(postPath(p.slug)), lastModified: p.updated })),
    ...changelog.items
      .filter((e) => e.publishedAt)
      .map((e) => ({ url: absoluteUrl(`${PAGES.changelog.path}/${e.slug}`), lastModified: e.publishedAt as string })),
  ];
}
