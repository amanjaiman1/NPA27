import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ButtonLink, Container } from "@/components/marketing/ui";
import { FEATURE_PAGES, PAGES } from "@/lib/seo/pages";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/** Any unknown address. Next serves it with a real 404 status. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Container className="max-w-2xl py-24 text-center">
          <p className="eyebrow text-accent">404</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tightest text-paper sm:text-4xl">
            This page doesn&apos;t exist
          </h1>
          <p className="mt-4 text-paper/65">
            The link may be old, or the address mistyped. These might be what you were looking for:
          </p>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-semibold">
            {[PAGES.features, ...FEATURE_PAGES.slice(0, 3), PAGES.blog, PAGES.resources].map((p) => (
              <li key={p.path}>
                <Link href={p.path} className="text-accent hover:underline">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/">Go to the home page</ButtonLink>
            <ButtonLink href="/dashboard" variant="ghost">
              Open your dashboard
            </ButtonLink>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
