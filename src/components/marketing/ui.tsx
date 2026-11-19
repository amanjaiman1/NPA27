/* ════════════════════════════════════════════════════════════════
   BUILDING BLOCKS FOR THE PUBLIC SITE
   Server components only: everything here renders to plain HTML, so the
   marketing pages are readable by crawlers without running JavaScript and
   cost visitors nothing to download beyond the page itself.
   They use the app's own tokens (ink, card, paper, line, accent), so the
   site and the product look like one thing.
   ════════════════════════════════════════════════════════════════ */

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>;
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-snugg transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

const buttonVariants = {
  primary: "bg-accent text-accent-fg shadow-accent hover:-translate-y-px hover:brightness-[1.08]",
  ghost: "border border-line bg-card text-paper shadow-soft hover:-translate-y-px hover:border-paper/25",
  quiet: "text-paper/70 hover:bg-paper/[0.06] hover:text-paper",
};

const buttonSizes = {
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[0.95rem]",
};

/**
 * A link styled as a button. `track` names the click for analytics (see
 * components/marketing/analytics.tsx); it does nothing when analytics is off.
 */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "lg",
  arrow = false,
  track,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  arrow?: boolean;
  track?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      data-track={track}
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
    >
      {children}
      {arrow && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Link>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("eyebrow text-accent", className)}>{children}</p>;
}

/** An H2 with its eyebrow and intro. */
export function SectionHeading({
  eyebrow,
  title,
  intro,
  id,
  center = false,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  id?: string;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center", className)}>
      {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
      <h2
        id={id}
        className="scroll-mt-24 text-balance font-display text-[1.75rem] font-bold leading-[1.15] tracking-tightest text-paper sm:text-[2.25rem]"
      >
        {title}
      </h2>
      {intro && <p className="mt-4 text-pretty text-base leading-relaxed text-paper/65 sm:text-[1.05rem]">{intro}</p>}
    </div>
  );
}

/** A full-width band of the page with consistent vertical rhythm. */
export function Band({
  children,
  className,
  tone = "plain",
  labelledBy,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "plain" | "raised";
  labelledBy?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("py-16 sm:py-24", tone === "raised" && "border-y border-line bg-card/60", className)}
    >
      {children}
    </section>
  );
}

/**
 * A product screenshot in a window frame. Screenshots use a sample account
 * with made-up data — never a real person's chronicle.
 */
export function Screenshot({
  src,
  alt,
  width,
  height,
  priority = false,
  sizes = "(min-width: 1024px) 960px, 100vw",
  caption,
  className,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  sizes?: string;
  caption?: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("min-w-0", className)}>
      <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-lift">
        <div className="flex h-7 items-center gap-1.5 border-b border-line bg-paper/[0.03] px-3" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-paper/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-paper/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-paper/15" />
        </div>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          priority={priority}
          className="h-auto w-full"
        />
      </div>
      {caption && <figcaption className="mt-3 text-center text-xs text-paper/50">{caption}</figcaption>}
    </figure>
  );
}

export function FeatureCard({
  icon: Icon,
  title,
  children,
  href,
  linkLabel,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-line bg-card p-6 shadow-soft">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-lg font-bold tracking-snugg text-paper">{title}</h3>
      <div className="mt-2 flex-1 text-sm leading-relaxed text-paper/65">{children}</div>
      {href && linkLabel && (
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
        >
          {linkLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function CheckList({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[0.95rem] leading-relaxed text-paper/75">
          <Check className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ steps }: { steps: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="rounded-2xl border border-line bg-card p-6 shadow-soft">
          <span className="tabular font-display text-sm font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="mt-2 text-base font-bold tracking-snugg text-paper">{s.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-paper/65">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export interface FaqItem {
  q: string;
  a: React.ReactNode;
}

/** Questions as native disclosure widgets: accessible, and no JavaScript. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-soft">
      {items.map((item) => (
        <details key={item.q} className="group px-5 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-semibold text-paper [&::-webkit-details-marker]:hidden">
            <h3 className="text-[0.98rem] tracking-snugg">{item.q}</h3>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-paper/45 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="pb-5 text-[0.95rem] leading-relaxed text-paper/70">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

/** The closing call to action every public page ends with. */
export function CtaBanner({
  title = "Start organising your UPSC preparation",
  body = "Create a free account and log your first day in a few minutes. Your data stays private to your account, and you can export or delete it whenever you like.",
  track = "cta_footer",
  secondary = { href: "/features", label: "See every feature" },
}: {
  title?: string;
  body?: string;
  track?: string;
  /** The quieter second button. */
  secondary?: { href: string; label: string; track?: string };
}) {
  return (
    <section aria-labelledby="cta-title" className="py-16 sm:py-20">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-line bg-card px-6 py-12 text-center shadow-lift sm:px-12">
          <div className="pointer-events-none absolute inset-0 bg-aura opacity-70" aria-hidden />
          <div className="relative">
            <h2 id="cta-title" className="text-balance font-display text-2xl font-bold tracking-tightest text-paper sm:text-3xl">
              {title}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-[0.98rem] leading-relaxed text-paper/65">{body}</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/signup" arrow track={track}>
                Create your free account
              </ButtonLink>
              <ButtonLink href={secondary.href} variant="ghost" track={secondary.track}>
                {secondary.label}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** Links to related pages, with descriptive anchor text. */
export function RelatedLinks({
  title = "Keep reading",
  links,
}: {
  title?: string;
  links: { href: string; label: string; description: string }[];
}) {
  return (
    <nav aria-label={title} className="mt-12">
      <h2 className="font-display text-xl font-bold tracking-tightest text-paper">{title}</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-accent/35"
            >
              <span className="flex items-center gap-1.5 font-semibold text-paper group-hover:text-accent">
                {l.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="mt-1.5 text-sm leading-relaxed text-paper/60">{l.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "What it doesn't do" — stated plainly so nobody signs up expecting it. */
export function Limits({ title = "What it doesn't do", items }: { title?: string; items: React.ReactNode[] }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-paper/[0.02] p-6">
      <h3 className="text-base font-bold tracking-snugg text-paper">{title}</h3>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-paper/65">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
