import Link from "next/link";
import { LifeBuoy, Mail, UserCog } from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { SITE } from "@/lib/seo/config";
import { getPublicSite } from "@/lib/platform/public-content";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container, FeatureCard } from "@/components/marketing/ui";

const page = PAGES.contact;
export const metadata = pageMetadata(page);

export default async function ContactPage() {
  // The support address set in the Admin Center, else the one set in the deployment.
  const email = (await getPublicSite()).supportEmail ?? SITE.contactEmail;
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Contact"
        title="Contact DoOrDie"
        intro={
          <p>
            {email
              ? "DoOrDie is a small, independent project, so replies can take a few days. Many account questions you can sort out yourself, straight away."
              : "DoOrDie is a small, independent project. Most account questions you can sort out yourself, straight away."}
          </p>
        }
      />
      <Band className="pt-0 sm:pt-0">
        <Container className="max-w-4xl">
          <div className={email ? "grid gap-4 md:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>
            {email && (
              <FeatureCard icon={Mail} title="Email">
                Questions, bug reports, feature ideas and privacy requests:{" "}
                <a href={`mailto:${email}`} className="font-semibold text-accent hover:underline">
                  {email}
                </a>
                .
              </FeatureCard>
            )}
            <FeatureCard icon={LifeBuoy} title="From inside the app">
              Signed in? Settings, then Help &amp; feedback, sends a bug report, an idea or a question straight to the
              team, with a screenshot if it helps. Their answer appears there too. Your email goes with it only if you
              choose.
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
