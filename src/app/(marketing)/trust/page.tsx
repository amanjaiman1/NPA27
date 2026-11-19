import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  BookLock,
  Cpu,
  Download,
  EyeOff,
  KeyRound,
  LifeBuoy,
  Mail,
  MessageSquareHeart,
  ShieldCheck,
  ShieldOff,
  Star,
  UserCog,
  Users,
} from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { SITE } from "@/lib/seo/config";
import { getPublicReviews, getPublicSite, getYouAsked } from "@/lib/platform/public-content";
import { PRODUCT_MODULES, PRODUCT_STATUS, PRODUCT_STATUS_ORDER, statusCounts, type ProductStatus } from "@/content/product-status";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, ButtonLink, Container, CtaBanner, Limits, SectionHeading } from "@/components/marketing/ui";
import { YouAskedList } from "@/components/platform/you-asked";
import { cn } from "@/lib/utils";

const page = PAGES.trust;
export const metadata = pageMetadata(page);
// The review figures, the support address and "You asked" come from the database: refreshed every five minutes at most.
export const revalidate = 300;

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const policy = (anchor: string) => `${PAGES.privacy.path}#${anchor}`;

const SECTIONS = [
  { id: "about", label: "About" },
  { id: "how-it-works", label: "How it fits together" },
  { id: "privacy", label: "Privacy" },
  { id: "status", label: "What's available" },
  { id: "reviews", label: "Reviews" },
  { id: "you-asked", label: "You asked" },
  { id: "support", label: "Support" },
  { id: "limits", label: "Limits" },
];

/** Each statement here is what the code does today; the privacy policy has the full account, linked from each. */
const PRIVACY: { icon: React.ElementType; title: string; body: string; anchor: string }[] = [
  {
    icon: ShieldCheck,
    title: "Private to your account",
    body: "The database itself lets each account read only its own records. Other users can never see them.",
    anchor: "access",
  },
  {
    icon: Download,
    title: "Yours to take or delete",
    body: "Download everything in your account, or delete the account and all of its data, from Settings at any time.",
    anchor: "rights",
  },
  {
    icon: EyeOff,
    title: "No ads, no selling",
    body: "Your data isn't sold, used for advertising or shared for marketing. It's used to run DoOrDie for you.",
    anchor: "use",
  },
  {
    icon: Cpu,
    title: "The coach stays in your browser",
    body: "The Study Coach works from fixed rules on your device. No AI model or outside service receives your records.",
    anchor: "collect",
  },
  {
    icon: BookLock,
    title: "Reminders without your writing",
    body: "The reminder service reads a trimmed copy without your writing: no reflections, diary words, review answers or notes. Habit and goal names are in it, because reminders mention them.",
    anchor: "access",
  },
  {
    icon: UserCog,
    title: "What the team can see",
    body: "The admin area shows account details such as the email address and sign-up date, never preparation data, and logs every action with who did it and why. The operator can technically reach the database, and looks at account data only to fix a problem, answer you, or when the law requires it.",
    anchor: "access",
  },
  {
    icon: Users,
    title: "Analytics only if you agree",
    body: "If it's switched on, analytics runs on the public pages only, after you agree in the banner, and never inside your account.",
    anchor: "collect",
  },
  {
    icon: BadgeCheck,
    title: "Reviews count dates, not words",
    body: "To check a review comes from real use, the database counts the dates of your records. It never reads what they say.",
    anchor: "collect",
  },
  {
    icon: KeyRound,
    title: "The security basics",
    body: "Connections use HTTPS, passwords are stored hashed by the sign-in provider, and keys that can bypass the database's protections stay on the server.",
    anchor: "security",
  },
];

const RECORD = ["Daily Journal", "Life Dashboard", "Revision", "Roadmap", "Goals", "Mock Analytics", "Subject Progress"];
const SEE = ["Command Center", "My Habits", "Performance Review", "Study Coach", "Study Heatmap", "Reminders"];

function Column({ title, items, tone = "plain" }: { title: string; items: string[]; tone?: "plain" | "accent" }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border p-5 shadow-soft", tone === "accent" ? "border-accent/30 bg-accent/[0.06]" : "border-line bg-card")}>
      <p className="eyebrow text-accent">{title}</p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <li key={i} className="rounded-full border border-line bg-paper/[0.03] px-2.5 py-1 text-xs font-semibold text-paper/80">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-paper/35" aria-hidden>
      <ArrowDown className="h-5 w-5 md:hidden" />
      <ArrowRight className="hidden h-5 w-5 md:block" />
    </div>
  );
}

/** How the modules relate, as in docs/connected-ecosystem.md: each record kept once, read by the rest. */
function ModuleMap() {
  return (
    <figure className="mt-8">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        <Column title="Where you record" items={RECORD} />
        <Arrow />
        <div className="flex min-w-0 flex-col justify-center rounded-2xl border border-accent/30 bg-accent/[0.06] p-5 shadow-soft">
          <p className="eyebrow text-accent">How it connects</p>
          <p className="mt-3 text-sm leading-relaxed text-paper/75">
            Each kind of record lives in one module, and the others read it. Nothing is copied, so an edit or a deletion shows
            everywhere.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-paper/75">
            What you did each day is worked out from those records every time, so your habits, your Performance Reviews and the coach always agree.
          </p>
        </div>
        <Arrow />
        <Column title="Where it comes together" items={SEE} />
      </div>
      <figcaption className="mt-4 flex items-start gap-2 rounded-2xl border border-dashed border-line px-4 py-3 text-sm leading-relaxed text-paper/65">
        <BookLock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span>
          <span className="font-semibold text-paper">The Personal Diary feeds nothing else.</span> Reviews, the coach and your
          habits never read it. Its one link is a count of entries, for a goal you set up to count them.
        </span>
      </figcaption>
    </figure>
  );
}

function StatusPill({ status }: { status: ProductStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold",
        status === "available" && "border-positive/30 bg-positive/10 text-positive",
        status === "beta" && "border-warning/35 bg-warning/10 text-warning",
        status === "in_development" && "border-accent/30 bg-accent/[0.08] text-accent",
        status === "planned" && "border-line bg-paper/[0.04] text-paper/65",
      )}
    >
      {PRODUCT_STATUS[status].label}
    </span>
  );
}

export default async function TrustPage() {
  const [reviews, site, asked] = await Promise.all([getPublicReviews(24), getPublicSite(), getYouAsked(6)]);
  const email = site.supportEmail ?? SITE.contactEmail;
  const counts = statusCounts();
  const notAvailable = counts.beta + counts.in_development + counts.planned;
  const rules = site.reviewRules;

  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Trust Center"
        title="How DoOrDie works, and how it treats your data"
        intro={
          <p>
            What DoOrDie is and isn&apos;t, how its parts fit together, what happens to your data, what&apos;s available today,
            how reviews are checked, and how to reach the team. Everything here describes the product as it works now.
          </p>
        }
      />
      <Container>
        <nav aria-label="On this page" className="-mt-4 mb-4">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-paper/70 shadow-soft transition-colors hover:border-accent/35 hover:text-paper"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>

      <Band labelledBy="about">
        <Container className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <SectionHeading
            id="about"
            eyebrow="About"
            title="An independent organiser for UPSC preparation"
            intro="DoOrDie is a free web app that keeps an aspirant's study log, syllabus, revision, mocks, plans and wellbeing in one private place, so the questions that matter (what to study next, what's slipping, whether it's working) have answers."
          />
          <ul className="space-y-3">
            {[
              <>
                <span className="font-semibold text-paper">Not affiliated with UPSC.</span> DoOrDie isn&apos;t connected to, endorsed by
                or sponsored by the Union Public Service Commission or the Government of India. See the{" "}
                <Link href={PAGES.disclaimer.path} className="font-semibold text-accent hover:underline">
                  disclaimer
                </Link>
                .
              </>,
              <>
                <span className="font-semibold text-paper">Not coaching.</span> It has no lectures, notes, test series or question
                bank. It helps you organise the preparation you&apos;re doing.
              </>,
              <>
                <span className="font-semibold text-paper">No promises about results.</span> It shows your preparation clearly. The
                work, and the result, are yours.
              </>,
              <>
                <span className="font-semibold text-paper">Works anywhere.</span> In the browser on a phone or a computer, installable
                like an app, offline too, syncing to your account when you reconnect.
              </>,
            ].map((item, i) => (
              <li key={i} className="rounded-2xl border border-line bg-card px-5 py-4 text-sm leading-relaxed text-paper/70 shadow-soft">
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="how-it-works">
        <Container>
          <SectionHeading
            id="how-it-works"
            eyebrow="How it fits together"
            title="One record, read everywhere it's needed"
            intro="You write each thing down once, where it belongs. The rest of DoOrDie reads it from there."
          />
          <ModuleMap />
        </Container>
      </Band>

      <Band labelledBy="privacy">
        <Container>
          <SectionHeading
            id="privacy"
            eyebrow="Privacy and security"
            title="What happens to your data, in plain words"
            intro="Each statement describes how DoOrDie is built today, and links to the part of the privacy policy that covers it in full."
          />
          <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PRIVACY.map((p) => (
              <li key={p.title} className="flex min-w-0 flex-col rounded-2xl border border-line bg-card p-5 shadow-soft">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
                  <p.icon className="h-4 w-4" />
                </span>
                <h3 className="mt-3 font-semibold tracking-snugg text-paper">{p.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-paper/65">{p.body}</p>
                <Link href={policy(p.anchor)} className="mt-3 text-xs font-semibold text-accent hover:underline">
                  In the privacy policy
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed text-paper/65 shadow-soft">
              <h3 className="font-semibold text-paper">Who processes data for DoOrDie</h3>
              <p className="mt-1.5">
                Supabase (the database and sign-in), Vercel (hosting), Resend (email), your browser&apos;s push service if you turn
                on notifications, and Google Analytics only if it&apos;s switched on and you agree. They may process data outside
                India. Details are in the{" "}
                <Link href={policy("processors")} className="font-semibold text-accent hover:underline">
                  privacy policy
                </Link>
                .
              </p>
            </div>
            <div className="flex gap-3 rounded-2xl border border-dashed border-line bg-paper/[0.02] p-5 text-sm leading-relaxed text-paper/65">
              <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-paper/45" aria-hidden />
              <div>
                <h3 className="font-semibold text-paper">What we don&apos;t claim</h3>
                <p className="mt-1.5">
                  DoOrDie has no security certification and hasn&apos;t been audited by an outside firm. It&apos;s a small,
                  independent project: the points above describe how it&apos;s built, and no system is perfectly secure.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="status">
        <Container>
          <SectionHeading
            id="status"
            eyebrow="Product status"
            title="What's available today"
            intro={
              notAvailable === 0
                ? `All ${PRODUCT_MODULES.length} parts of DoOrDie are available to every account, free. Nothing is in beta or being built at the moment; when something is, it will be listed here with that status.`
                : `${counts.available} parts of DoOrDie are available to every account, free. The others are marked with where they stand.`
            }
          />
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-paper/60">
            {PRODUCT_STATUS_ORDER.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <dt>
                  <StatusPill status={s} />
                </dt>
                <dd>{PRODUCT_STATUS[s].meaning}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_MODULES.map((m) => (
              <li key={m.key} className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 shadow-soft">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-paper">{m.name}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-paper/60">{m.summary}</p>
                </div>
                <StatusPill status={m.status} />
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-paper/60">
            Every change that ships is in the{" "}
            <Link href={PAGES.changelog.path} className="font-semibold text-accent hover:underline">
              changelog
            </Link>
            . To try it all without an account, open the{" "}
            <Link href={PAGES.demo.path} className="font-semibold text-accent hover:underline">
              interactive demo
            </Link>
            .
          </p>
        </Container>
      </Band>

      <Band labelledBy="reviews">
        <Container className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
          <SectionHeading
            id="reviews"
            eyebrow="Reviews"
            title="Reviews from real use, shown as written"
            intro={
              rules
                ? `Only signed-in students can review DoOrDie, once ${days(rules.minDays)} have passed since their first record and they have records on ${days(rules.minUsageDays)}. A moderator checks each one for spam, abuse and personal details only, and it appears only if its author allows it.`
                : "Only signed-in students who have used DoOrDie on several different days can review it. A moderator checks each one for spam, abuse and personal details only, and it appears only if its author allows it."
            }
          />
          <div className="rounded-2xl border border-line bg-card p-6 shadow-soft">
            <p className="flex items-center gap-2 text-sm font-semibold text-paper">
              <Star className="h-4 w-4 text-warning" aria-hidden />
              {reviews.total === 0
                ? "No reviews are published yet."
                : `${reviews.total} published ${reviews.total === 1 ? "review" : "reviews"}`}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-paper/65">
              {reviews.total === 0
                ? "We won't fill the space with made-up ones. The first reviews appear here once students who've used DoOrDie long enough choose to share them."
                : reviews.averageRating !== null
                  ? `They average ${reviews.averageRating.toFixed(1)} out of 5, counting every published review, whatever its rating.`
                  : `An average appears once ${reviews.minForAggregate} are published, so a handful of ratings can't give the wrong idea.`}
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-paper/65">
              <li>Never chosen or left out because of their rating.</li>
              <li>Never paid for, rewarded or written by the team.</li>
              <li>Badges come from the author&apos;s records, worked out by the database.</li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <ButtonLink href={PAGES.reviews.path} size="md" variant={reviews.total ? "primary" : "ghost"} arrow>
                {reviews.total ? "Read the reviews" : "How reviews work"}
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="you-asked">
        <Container>
          <SectionHeading
            id="you-asked"
            eyebrow="You asked. We improved."
            title="Changes that came from students' feedback"
            intro="Feedback sent from inside the app, linked by the team to the change that answered it. Only the theme is shown, in the team's words: never who sent it or what they wrote."
          />
          <div className="mt-8">
            {asked.length ? (
              <YouAskedList items={asked} compact />
            ) : (
              <p className="flex items-start gap-2 rounded-2xl border border-dashed border-line px-5 py-4 text-sm leading-relaxed text-paper/65">
                <MessageSquareHeart className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                Nothing here yet. An entry appears only when a change that shipped is linked to feedback students actually sent.
              </p>
            )}
          </div>
        </Container>
      </Band>

      <Band labelledBy="support">
        <Container>
          <SectionHeading
            id="support"
            eyebrow="Support"
            title="How to reach the team"
            intro="There's no guaranteed reply time: DoOrDie is run by a small, independent team. Many account questions you can sort out yourself, straight away."
          />
          <ul className={cn("mt-8 grid gap-4", email ? "md:grid-cols-3" : "md:grid-cols-2")}>
            <li className="rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed text-paper/65 shadow-soft">
              <LifeBuoy className="h-5 w-5 text-accent" aria-hidden />
              <h3 className="mt-3 font-semibold text-paper">From inside the app</h3>
              <p className="mt-1.5">
                Settings, then Help &amp; feedback, sends a bug report, an idea or a question to the team. Their answer appears there
                too.
              </p>
            </li>
            {email && (
              <li className="rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed text-paper/65 shadow-soft">
                <Mail className="h-5 w-5 text-accent" aria-hidden />
                <h3 className="mt-3 font-semibold text-paper">By email</h3>
                <p className="mt-1.5">
                  Questions, privacy requests and anything else:{" "}
                  <a href={`mailto:${email}`} className="font-semibold text-accent hover:underline">
                    {email}
                  </a>
                  .
                </p>
              </li>
            )}
            <li className="rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed text-paper/65 shadow-soft">
              <UserCog className="h-5 w-5 text-accent" aria-hidden />
              <h3 className="mt-3 font-semibold text-paper">Your account, yourself</h3>
              <p className="mt-1.5">
                Download your data or delete your account in Settings, any time. Locked out? Use{" "}
                <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
                  Forgot password
                </Link>
                .
              </p>
            </li>
          </ul>
        </Container>
      </Band>

      <Band tone="raised" labelledBy="limits">
        <Container>
          <h2 id="limits" className="sr-only scroll-mt-24">
            Limits
          </h2>
          <Limits
            title="What DoOrDie doesn't do"
            items={[
              "Teach the syllabus. There are no notes, lectures, test series or question bank.",
              "Help with UPSC applications, admit cards or results. For those, use upsc.gov.in.",
              "Use AI. The Study Coach follows fixed rules, so it can answer only what those rules cover.",
              "Promise uptime or reply times. It's a small, independent project.",
              "Come from an app store. It's a web app you can install from the browser.",
              "Check every claim in a review. A badge confirms a real account wrote it after real use, nothing more.",
            ]}
          />
        </Container>
      </Band>

      <CtaBanner
        title="See it for yourself"
        body="Create a free account, or try the interactive demo first: the real app with a made-up sample account, and nothing saved."
        track="cta_trust_footer"
        secondary={{ href: PAGES.demo.path, label: "Try the demo", track: "cta_trust_demo" }}
      />
    </>
  );
}
