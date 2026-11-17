import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container } from "@/components/marketing/ui";
import { Prose } from "@/components/marketing/prose";
import { longDate } from "@/content/upsc-calendar";

const page = PAGES.disclaimer;
export const metadata = pageMetadata(page);

export default function DisclaimerPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Legal"
        title="Disclaimer"
        intro={
          <p>
            DoOrDie is an independent preparation tool. Last updated{" "}
            <time dateTime={page.updated}>{longDate(page.updated)}</time>.
          </p>
        }
      />
      <Band className="pt-0 sm:pt-0">
        <Container className="max-w-3xl">
          <Prose>
            <h2 id="affiliation">Not affiliated with UPSC</h2>
            <p>
              DoOrDie is not affiliated with, endorsed by, sponsored by or connected to the Union Public Service
              Commission (UPSC), the Government of India, or any government body. It is not an official UPSC application
              and it does not provide any government service. Names such as &ldquo;UPSC&rdquo; and &ldquo;Civil Services
              Examination&rdquo; are used only to describe the examination that DoOrDie helps people prepare for.
            </p>
            <p>
              For official information, notifications, applications, admit cards and results, use UPSC&apos;s own website,{" "}
              <a href="https://upsc.gov.in" rel="noopener">
                upsc.gov.in
              </a>
              .
            </p>

            <h2 id="exam-information">Exam information</h2>
            <p>
              Where this site gives exam dates, rules or patterns, they are summarised from UPSC&apos;s published
              documents, linked where they appear, and dated. UPSC can change its rules and calendar. If anything here
              differs from UPSC&apos;s official documents, the official documents are correct.
            </p>

            <h2 id="results">No guarantee of results</h2>
            <p>
              DoOrDie helps you record and review your preparation. It does not guarantee any result in any examination,
              and nothing on this site should be read as a promise of selection.
            </p>

            <h2 id="advice">Guides are general information</h2>
            <p>
              The <Link href={PAGES.blog.path}>guides</Link> describe general study methods. They are not professional,
              medical or psychological advice. If you are struggling with your health or wellbeing, please speak to a
              qualified professional.
            </p>

            <h2 id="screenshots">Screenshots</h2>
            <p>
              Product screenshots on this site show a sample account with made-up data. No real person&apos;s
              preparation is shown.
            </p>

            <h2 id="links">Links to other sites</h2>
            <p>
              This site links to other websites, such as UPSC&apos;s and published research, for reference. We are not
              responsible for their content.
            </p>
          </Prose>
        </Container>
      </Band>
    </>
  );
}
