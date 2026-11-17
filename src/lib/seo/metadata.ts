import type { Metadata } from "next";
import { SITE } from "./config";
import type { PublicPage } from "./pages";

/**
 * Next.js metadata for one public page: title, description, canonical URL and
 * the matching Open Graph / X cards. Relative URLs resolve against
 * `metadataBase` (set in the root layout), so everything points at the one
 * canonical domain whichever host served the request.
 *
 * Open Graph is set in full on every page: Next merges metadata shallowly, so
 * a page that set `openGraph` without images would silently drop the card.
 */
export function pageMetadata(
  page: Pick<PublicPage, "path" | "title" | "description"> & { kind?: PublicPage["kind"] },
  options: {
    type?: "website" | "article";
    publishedTime?: string;
    modifiedTime?: string;
  } = {},
): Metadata {
  const absoluteTitle = page.kind === "home";
  const fullTitle = absoluteTitle ? page.title : `${page.title} | ${SITE.name}`;
  const image = { ...SITE.ogImage };

  return {
    title: absoluteTitle ? { absolute: page.title } : page.title,
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      type: options.type ?? "website",
      url: page.path,
      siteName: SITE.name,
      locale: SITE.locale,
      title: fullTitle,
      description: page.description,
      images: [image],
      ...(options.type === "article"
        ? {
            publishedTime: options.publishedTime,
            modifiedTime: options.modifiedTime,
            authors: [SITE.name],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: page.description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}
