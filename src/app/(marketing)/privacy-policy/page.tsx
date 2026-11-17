import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
import { SITE } from "@/lib/seo/config";
import { PageHero } from "@/components/marketing/page-hero";
import { Band, Container } from "@/components/marketing/ui";
import { Prose } from "@/components/marketing/prose";
import { AnalyticsChoiceReset } from "@/components/marketing/analytics";
import { longDate } from "@/content/upsc-calendar";

const page = PAGES.privacy;
export const metadata = pageMetadata(page);

export default function PrivacyPolicyPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: page.label, path: page.path }]}
        eyebrow="Legal"
        title="Privacy policy"
        intro={
          <p>
            What DoOrDie collects, why, where it is kept, who helps us process it, and how you can download or delete it.
            Last updated <time dateTime={page.updated}>{longDate(page.updated)}</time>.
          </p>
        }
      />
      <Band className="pt-0 sm:pt-0">
        <Container className="max-w-3xl">
          <Prose>
            <h2 id="summary">The short version</h2>
            <ul>
              <li>Your preparation data is private to your account. Other users can never see it.</li>
              <li>We use it only to run DoOrDie for you. We do not sell it, advertise with it, or share it for marketing.</li>
              <li>You can download all of it, or delete your account and all of it, from Settings at any time.</li>
              <li>Analytics, if it is switched on, only runs on the public pages and only if you agree.</li>
            </ul>

            <h2 id="who">Who we are</h2>
            <p>
              DoOrDie is an independent web app for organising UPSC preparation, run by {SITE.maker} (&ldquo;we&rdquo;,
              &ldquo;us&rdquo;). This policy covers the DoOrDie website and app. You can reach us through the{" "}
              <Link href={PAGES.contact.path}>contact page</Link>.
            </p>

            <h2 id="collect">What we collect</h2>
            <h3>Your account</h3>
            <p>
              Your name, email address and password when you sign up. Passwords are handled by our authentication
              provider and stored only in hashed form; we never see them.
            </p>
            <h3>Your preparation data</h3>
            <p>
              Whatever you choose to enter: your profile (target exam, exam date, attempt, optional subject, daily hours
              target, time zone), journal entries, study hours, syllabus progress, revisions, mock tests, mistakes, goals,
              reviews, reflections, habits, books, current affairs notes, and life dashboard entries such as sleep,
              exercise, screen time and weight. It also includes your appearance and notification settings. It is stored
              as one record that belongs to your account.
            </p>
            <h3>Notifications</h3>
            <p>
              If you turn on notifications that arrive when the app is closed, we store the subscription your browser
              gives us (an address at your browser&apos;s push service and its keys), your device type, browser
              details and time zone, so reminders arrive at sensible times. We also keep a short log of what was sent, to
              avoid repeats.
            </p>
            <h3>On your device</h3>
            <p>
              The app keeps a copy of your data, your sign-in session and your settings in your browser&apos;s storage,
              so it works offline and loads quickly. When you sign out, the copy on that device is removed once it has
              synced. If there are changes that have not synced yet, you are asked first.
            </p>
            <h3>Technical logs</h3>
            <p>
              Our hosting and database providers record technical information such as IP addresses, browser type and the
              time of requests, for security and to keep the service running.
            </p>
            <h3>Analytics, only with your consent</h3>
            <p>
              If analytics is switched on for this site, a banner asks before anything is collected. If you agree, Google
              Analytics records which public pages you visit, which buttons you click, and whether you completed sign-up.
              It uses cookies. It does not run inside your account, and it never receives your preparation data. If you
              decline, nothing is sent.
            </p>
            <div className="not-prose my-4">
              <AnalyticsChoiceReset />
            </div>

            <h2 id="use">How we use it</h2>
            <ul>
              <li>To provide DoOrDie: save your data, sync it across your devices and show you your progress.</li>
              <li>To send account emails, such as confirming your address or resetting your password.</li>
              <li>To send the reminders you have turned on.</li>
              <li>To keep the service secure and working.</li>
              <li>If you agreed to analytics, to understand which public pages are useful.</li>
            </ul>
            <p>We do not sell your data, use it for advertising, or share it with other users.</p>

            <h2 id="processors">Who processes it for us</h2>
            <p>We use a small number of service providers to run DoOrDie. They process data on our behalf:</p>
            <ul>
              <li>
                <strong>Supabase:</strong> the database that stores your account and preparation data, and sign-in.
              </li>
              <li>
                <strong>Vercel:</strong> hosting for the website and the app&apos;s server functions.
              </li>
              <li>
                <strong>Resend:</strong> sending account emails.
              </li>
              <li>
                <strong>Your browser&apos;s push service</strong> (for example Google, Apple, Microsoft or Mozilla):
                delivering notifications, if you turn them on.
              </li>
              <li>
                <strong>Google Analytics:</strong> visit statistics for the public pages, only if analytics is switched on
                and you agree.
              </li>
            </ul>
            <p>These providers may store or process data outside India.</p>

            <h2 id="access">Who can see your data</h2>
            <p>
              You, through your account. Other users cannot: the database itself only lets each account read its own
              record. The automated reminder service reads a trimmed copy of your data, without your written notes, to
              decide which reminders to send. As the operator, we can technically access the database to run the service.
              We do not look at account data except to fix a problem, to respond to a request from you, or when the law
              requires it.
            </p>

            <h2 id="rights">Your choices</h2>
            <ul>
              <li>
                <strong>See and download your data:</strong> Settings, then Data, then download. You get a file with
                everything in your account.
              </li>
              <li>
                <strong>Correct it:</strong> edit anything directly in the app.
              </li>
              <li>
                <strong>Delete it:</strong> Settings, then Delete account. This permanently deletes your account, your
                preparation data and your notification subscriptions.
              </li>
              <li>
                <strong>Stop notifications:</strong> turn them off in Settings or in your browser.
              </li>
              <li>
                <strong>Withdraw analytics consent:</strong> use the button above, or clear this site&apos;s data in your
                browser.
              </li>
            </ul>
            <p>
              We aim to handle personal data in line with India&apos;s Digital Personal Data Protection Act, 2023. If you
              have a question or a complaint about how your data is handled, contact us and we will respond.
            </p>

            <h2 id="retention">How long we keep it</h2>
            <p>
              Your account and preparation data are kept for as long as your account exists, and deleted when you delete
              it. Copies on your own devices stay until you sign out or clear your browser&apos;s data. Our providers may
              keep technical logs and backups for a limited time under their own policies.
            </p>

            <h2 id="security">Security</h2>
            <p>
              Connections are encrypted with HTTPS. The database stops accounts from reading each other&apos;s data,
              passwords are stored hashed, and keys that can bypass those protections are kept on the server only. No
              system is perfectly secure, so please use a strong password that you do not use elsewhere.
            </p>

            <h2 id="children">Children</h2>
            <p>
              DoOrDie is meant for adults preparing for the Civil Services Examination. It is not directed at children
              under 18, and we do not knowingly collect their data.
            </p>

            <h2 id="changes">Changes to this policy</h2>
            <p>
              If we change this policy, we will update the date at the top. If a change significantly affects how your data
              is used, we will tell you in the app or by email before it takes effect.
            </p>
          </Prose>
        </Container>
      </Band>
    </>
  );
}
