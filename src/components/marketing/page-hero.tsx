import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import type { Crumb } from "@/lib/seo/schema";
import { ButtonLink, Container, Eyebrow, Screenshot } from "./ui";
import type { Shot } from "./shots";

/**
 * The top of every inner page: breadcrumbs, the page's one H1, an intro and,
 * for product pages, a call to action and a screenshot.
 */
export function PageHero({
  crumbs,
  eyebrow,
  title,
  intro,
  cta,
  shot,
  shotCaption,
}: {
  crumbs: Crumb[];
  eyebrow: string;
  title: React.ReactNode;
  intro: React.ReactNode;
  /** Analytics name for the primary button; omit to show no buttons. */
  cta?: string;
  shot?: Shot;
  shotCaption?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-aura opacity-70" aria-hidden />
      <Container className="relative pb-12 pt-8 sm:pt-12">
        <Breadcrumbs crumbs={crumbs} />
        <div className="mt-8 max-w-3xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1
            id="page-title"
            className="mt-3 text-balance font-display text-[2.1rem] font-bold leading-[1.08] tracking-tightest text-paper sm:text-[3rem]"
          >
            {title}
          </h1>
          <div className="mt-5 space-y-3 text-pretty text-[1.05rem] leading-relaxed text-paper/70 sm:text-lg">{intro}</div>
          {cta && (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" arrow track={cta}>
                Start free
              </ButtonLink>
              <ButtonLink href="/features" variant="ghost">
                See all features
              </ButtonLink>
            </div>
          )}
        </div>
        {shot && (
          <Screenshot
            {...shot}
            priority
            caption={shotCaption}
            sizes="(min-width: 1100px) 1088px, 100vw"
            className="mx-auto mt-12 max-w-5xl"
          />
        )}
      </Container>
    </section>
  );
}
