import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { FEATURE_PAGES, PAGES, RESOURCE_PAGES } from "@/lib/seo/pages";
import { SITE } from "@/lib/seo/config";
import { POSTS, postPath } from "@/content/blog";
import { Container } from "./ui";

interface FooterLink {
  href: string;
  label: string;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { href: PAGES.features.path, label: "All features" },
      ...FEATURE_PAGES.map((p) => ({ href: p.path, label: p.label })),
    ],
  },
  {
    title: "Free tools",
    links: [
      ...RESOURCE_PAGES.map((p) => ({ href: p.path, label: p.label })),
      { href: PAGES.resources.path, label: "All free tools" },
    ],
  },
  {
    title: "Guides",
    links: [
      ...POSTS.slice(0, 5).map((p) => ({ href: postPath(p.slug), label: p.short })),
      { href: PAGES.blog.path, label: "All guides" },
    ],
  },
  {
    title: "DoOrDie",
    links: [PAGES.about, PAGES.testimonials, PAGES.changelog, PAGES.contact, PAGES.privacy, PAGES.terms, PAGES.disclaimer].map((p) => ({
      href: p.path,
      label: p.label,
    })),
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-card/60 print:hidden">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div className="max-w-xs">
          <Link href="/" className="flex items-center gap-2.5" aria-label="DoOrDie home">
            <Logo className="h-7 w-7" />
            <span className="font-display text-lg font-bold tracking-tightest text-paper">DoOrDie</span>
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-paper/60">
            A free UPSC preparation tracker. Your study days, syllabus, revisions and mocks in one private account.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold text-paper">{col.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-paper/60 transition-colors hover:text-paper">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-line">
        <Container className="flex flex-col gap-2 py-6 text-xs leading-relaxed text-paper/55 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE.name}. An independent preparation tool, not affiliated with or endorsed by UPSC or the
            Government of India.
          </p>
        </Container>
      </div>
    </footer>
  );
}
