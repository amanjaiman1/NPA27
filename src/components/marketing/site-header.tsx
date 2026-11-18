import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { PAGES } from "@/lib/seo/pages";
import { AccountLinks } from "./account-links";
import { InstallAppButton } from "./install-app";
import { Container } from "./ui";

const NAV = [PAGES.features, PAGES.resources, PAGES.blog, PAGES.about];

/**
 * The public site's header. Plain links (crawlable, no JavaScript needed); the
 * mobile menu is a native <details> disclosure. "Install app" appears beside
 * them when this browser can install the app.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-xl print:hidden">
      <Container className="flex h-16 items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="DoOrDie home">
          <Logo className="h-7 w-7" />
          <span className="font-display text-lg font-bold tracking-tightest text-paper">DoOrDie</span>
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((p) => (
              <li key={p.path}>
                <Link
                  href={p.path}
                  className="rounded-full px-3 py-2 text-sm font-medium text-paper/70 transition-colors hover:bg-paper/[0.06] hover:text-paper"
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <InstallAppButton />
          <div className="hidden md:block">
            <AccountLinks />
          </div>
        </div>

        <details className="group relative md:hidden">
          <summary
            className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full border border-line bg-card text-paper shadow-soft [&::-webkit-details-marker]:hidden"
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </summary>
          <div className="absolute right-0 top-12 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border border-line bg-card p-3 shadow-lift">
            <nav aria-label="Main">
              <ul className="space-y-0.5">
                {NAV.map((p) => (
                  <li key={p.path}>
                    <Link
                      href={p.path}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-paper/80 hover:bg-paper/[0.06] hover:text-paper"
                    >
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-3 border-t border-line pt-3">
              <AccountLinks compact />
            </div>
          </div>
        </details>
      </Container>
    </header>
  );
}
