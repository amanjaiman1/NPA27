import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container } from "@/components/marketing/ui";
import { Prose } from "@/components/marketing/prose";
import { longDate } from "@/content/upsc-calendar";

const page = PAGES.terms;
export const metadata = pageMetadata(page);

export default function TermsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Legal"
        title="Terms of service"
        intro={
          <p>
            The terms for using DoOrDie. Please read them before creating an account. Last updated{" "}
            <time dateTime={page.updated}>{longDate(page.updated)}</time>.
          </p>
        }
      />
      <Band className="pt-0 sm:pt-0">
        <Container className="max-w-3xl">
          <Prose>
            <h2 id="agreement">1. Using DoOrDie</h2>
            <p>
              By creating an account or using DoOrDie, you agree to these terms and to the{" "}
              <Link href={PAGES.privacy.path}>privacy policy</Link>. If you do not agree, please do not use the service.
            </p>

            <h2 id="service">2. The service</h2>
            <p>
              DoOrDie is a free tool for recording and reviewing your preparation for the Civil Services Examination. It
              is provided as it is and as available. We may change, add or remove features, and we may stop offering the
              service. If we plan to stop it, we will try to give reasonable notice so that you can download your data.
            </p>

            <h2 id="account">3. Your account</h2>
            <ul>
              <li>Give accurate details when you sign up, and keep your password private.</li>
              <li>An account is for one person. You are responsible for what happens in your account.</li>
              <li>Tell us if you think someone else has access to your account.</li>
            </ul>

            <h2 id="content">4. Your data</h2>
            <p>
              What you enter in DoOrDie is yours. You allow us to store and process it only to provide the service to you,
              as described in the privacy policy. You can download it or delete it at any time from Settings.
            </p>

            <h2 id="use">5. Acceptable use</h2>
            <p>Please do not:</p>
            <ul>
              <li>use DoOrDie for anything unlawful;</li>
              <li>try to access another person&apos;s account or data, or get around the service&apos;s security;</li>
              <li>disrupt or overload the service, including with automated requests;</li>
              <li>store content in it that you do not have the right to store.</li>
            </ul>
            <p>We may suspend or close an account that breaks these rules.</p>

            <h2 id="no-guarantee">6. No guarantee of results</h2>
            <p>
              DoOrDie helps you organise and review your own work. It does not guarantee any result in any examination.
              Suggestions it makes, such as a suggested study day, are general and based only on the data you have
              entered.
            </p>

            <h2 id="information">7. Exam information and guides</h2>
            <p>
              DoOrDie is not affiliated with UPSC (see the <Link href={PAGES.disclaimer.path}>disclaimer</Link>). Exam
              dates and rules shown on this site are summaries of UPSC&apos;s published documents and can change. The
              official documents on upsc.gov.in always take precedence. Guides are general information and may contain
              errors; they are not professional advice.
            </p>

            <h2 id="liability">8. Liability</h2>
            <p>
              To the extent the law allows, DoOrDie is provided without warranties of any kind, and we are not liable for
              any indirect or consequential loss arising from its use, including lost data. Keep your own backups of
              anything important; the download in Settings makes this easy. Nothing in these terms limits any right you
              have that cannot be limited by law.
            </p>

            <h2 id="ending">9. Ending your use</h2>
            <p>
              You can stop using DoOrDie and delete your account at any time from Settings. Deleting your account
              permanently deletes its data.
            </p>

            <h2 id="changes">10. Changes to these terms</h2>
            <p>
              We may update these terms. We will change the date at the top, and tell you in the app or by email before a
              significant change takes effect. Continuing to use DoOrDie after that means you accept the updated terms.
            </p>

            <h2 id="law">11. Governing law</h2>
            <p>These terms are governed by the laws of India.</p>

            <h2 id="contact">12. Contact</h2>
            <p>
              Questions about these terms are welcome on the <Link href={PAGES.contact.path}>contact page</Link>.
            </p>
          </Prose>
        </Container>
      </Band>
    </>
  );
}
