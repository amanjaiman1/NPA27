import Link from "next/link";
import { Bug, Mail, UserCog } from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { SITE } from "@/lib/seo/config";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, FeatureCard } from "@/components/marketing/ui";

const page = PAGES.contact;
export const metadata = pageMetadata(page);

export default function ContactPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Contact"
        title="Contact DoOrDie"
        intro={
          <p>
            DoOrDie is a small, independent project, so replies can take a few days. Here is the quickest way to reach us
            for each kind of question.
          </p>
        }
      />
      <Band className="pt-0 sm:pt-0">
        <Container className="max-w-4xl">
          <div className="grid gap-4 md:grid-cols-3">
            {SITE.contactEmail && (
              <FeatureCard icon={Mail} title="Email">
                For anything else, including privacy questions:{" "}
                <a href={`mailto:${SITE.contactEmail}`} className="font-semibold text-accent hover:underline">
                  {SITE.contactEmail}
                </a>
                .
              </FeatureCard>
            )}
            <FeatureCard icon={Bug} title="Bugs and ideas">
              Report a bug or suggest a feature on{" "}
              <a href={`${SITE.repository}/issues`} rel="noopener" className="font-semibold text-accent hover:underline">
                GitHub Issues
              </a>
              . Issues are public, so please don&apos;t include personal details or anything from your journal.
            </FeatureCard>
            <FeatureCard icon={UserCog} title="Your account and data">
              You can download your data or delete your account yourself, any time, in Settings. If you can&apos;t sign
              in, use{" "}
              <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
                Forgot password
              </Link>
              .
            </FeatureCard>
          </div>
          <p className="mt-8 text-sm leading-relaxed text-paper/60">
            DoOrDie is not affiliated with UPSC and cannot help with applications, admit cards or results. For those,
            contact UPSC through{" "}
            <a href="https://upsc.gov.in" rel="noopener" className="font-semibold text-accent hover:underline">
              upsc.gov.in
            </a>
            . How we handle personal data is described in the{" "}
            <Link href={PAGES.privacy.path} className="font-semibold text-accent hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </Container>
      </Band>
    </>
  );
}
