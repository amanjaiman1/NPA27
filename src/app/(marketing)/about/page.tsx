import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, CtaBanner } from "@/components/marketing/ui";
import { Prose } from "@/components/marketing/prose";

const page = PAGES.about;
export const metadata = pageMetadata(page);

export default function AboutPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="About"
        title="About DoOrDie"
        intro={
          <p>
            DoOrDie is a free UPSC preparation tracker: one private place for an aspirant&apos;s daily study log,
            syllabus progress, revision and mock tests. This page explains why it exists and what it will and will not
            do.
          </p>
        }
      />
      <Band className="pt-0 sm:pt-0">
        <Container className="max-w-3xl">
          <Prose>
            <h2>Why it exists</h2>
            <p>
              Preparing for the Civil Services Examination produces a lot of information: hours, topics, revisions,
              mock scores, mistakes, notes on the news. It usually ends up spread across notebooks, a spreadsheet and a
              few apps, none of which talk to each other. The result is that the questions that matter, such as what to
              study next, what is slipping, and whether it is working, are hard to answer.
            </p>
            <p>
              DoOrDie keeps all of it in one place. One daily entry feeds a syllabus tracker, a revision schedule, mock
              analytics, goals and reviews, so those questions have answers. It is free for any aspirant.
            </p>

            <h2>What we believe</h2>
            <ul>
              <li>
                <strong>Your preparation belongs to you.</strong> Each account&apos;s data is private, kept separate by
                the database itself. You can download all of it, or delete your account and everything in it, from
                Settings, at any time.
              </li>
              <li>
                <strong>Honesty about what the product does.</strong> Every feature page lists what the feature does not
                do. There are no invented testimonials, ratings or user numbers on this site, and nothing is described as
                AI that is not.
              </li>
              <li>
                <strong>Calm, not addictive.</strong> There are no ads, no leaderboards and no notifications you did not
                choose.
              </li>
              <li>
                <strong>Built for the long run.</strong> Preparation takes a year or more. The product is designed for
                the ordinary days, not just the good ones.
              </li>
            </ul>

            <h2>What DoOrDie is not</h2>
            <ul>
              <li>
                It is not affiliated with, endorsed by or connected to the Union Public Service Commission or the
                Government of India. See the <Link href={PAGES.disclaimer.path}>disclaimer</Link>.
              </li>
              <li>It is not coaching or a test series. It does not provide notes, lectures or a question bank.</li>
              <li>It does not promise results. It helps you see your preparation clearly; the work is yours.</li>
            </ul>

            <h2>How it is built</h2>
            <p>
              DoOrDie is a web app that works in the browser on phones and computers and can be installed like an app. It
              keeps working offline and syncs to your account when you reconnect. Accounts and data are stored with
              Supabase, using database rules that stop any account from reading another&apos;s. The site is hosted on
              Vercel.
            </p>

            <h2>How the guides are written</h2>
            <p>
              The <Link href={PAGES.blog.path}>guides</Link> explain practical methods for running a preparation. Where
              they state exam rules or dates, those are checked against UPSC&apos;s own documents and linked. Where they
              refer to research, the study is linked. Each guide shows when it was published and last updated, and we
              correct mistakes when they are pointed out.
            </p>

            <h2>Get in touch</h2>
            <p>
              Questions, bug reports and suggestions are welcome. See the <Link href={PAGES.contact.path}>contact
              page</Link>.
            </p>
          </Prose>
        </Container>
      </Band>
      <CtaBanner />
    </>
  );
}
