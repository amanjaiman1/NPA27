import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { PAGES } from "@/lib/seo/pages";
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
              <li>
                If a page breaks, the app emails us a crash report with technical details only, never anything you wrote.
                You can switch that off.
              </li>
              <li>Analytics, if it is switched on, only runs on the public pages and only if you agree.</li>
            </ul>

            <h2 id="who">Who we are</h2>
            <p>
              DoOrDie (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is an independent web app for organising UPSC
              preparation. This policy covers the DoOrDie website and app. You can reach us through the{" "}
              <Link href={PAGES.contact.path}>contact page</Link>, or from Settings, then Help &amp; feedback, in the
              app.
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
              target, time zone), journal entries and the files you attach to them, study hours, syllabus progress,
              revisions, mock tests, mistakes, goals, habits and the corrections you make to them, your Roadmap plans,
              Performance Reviews, your Personal Diary, books, current affairs notes, and life dashboard entries such as
              sleep, exercise, screen time and weight. It also includes the Study Coach&apos;s history (below) and your
              appearance, notification and crash report settings. It is stored as one record that belongs to your account;
              attached files are stored separately, in private storage only your account can open.
            </p>
            <h3>The Study Coach</h3>
            <p>
              The coach works out its suggestions and answers with fixed rules, from your own records, in your browser. No
              AI model or other outside service receives your records or what you ask it. What you type in its Talk tab is
              not saved. The suggestions it made, and what you did with each one, are saved in your account so they follow
              you across devices.
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
            <h3>Crash reports</h3>
            <p>
              If a page fails, the app sends us a crash report by email: the error message and its technical trace, the
              page&apos;s address without anything after a question mark, your browser&apos;s name and version, the time,
              whether you were online and whether you were signed in. It never includes your account, your name, your email
              address or anything you entered. Reports are on unless you switch them off in Settings, then Help &amp;
              feedback. On the error screen you can also write a note about what happened; it is sent only if you press
              Send.
            </p>
            <h3>Messages you send us</h3>
            <p>
              If you write to us from Settings, then Help &amp; feedback, we receive your message, the topic you picked and
              your account&apos;s id, so we can look into a problem. Your email address is included only if you leave
              &ldquo;Include my email&rdquo; on, so we can reply. Your browser, window size and whether the app is
              installed are included only if you leave &ldquo;Include technical details&rdquo; on.
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
              <li>To find and fix crashes, and to read and answer the messages you send us.</li>
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
                <strong>Resend:</strong> sending account emails, and delivering crash reports and your messages to us.
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
              record. As the operator, we can technically access the database to run the service. We do not look at
              account data except to fix a problem, to respond to a request from you, or when the law requires it.
            </p>
            <p>
              The automated reminder service reads a trimmed copy of your data to decide which reminders to send. It
              leaves out your writing: journal reflections, wins, lessons and highlights; the words of your Personal Diary
              (it sees only the dates of entries); what you wrote in Performance Reviews; the questions, answers and
              explanations in your mistake notebook; current affairs summaries; goal and life dashboard notes; and habit
              descriptions. From the Roadmap it receives only each plan&apos;s completed activities (their kind, subject and
              when they were completed), never titles or notes. It receives nothing from the Study Coach and no details of your attached
              files. Names such as a habit&apos;s or a goal&apos;s are included, because reminders mention them.
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
                preparation data, your attached files and your notification subscriptions.
              </li>
              <li>
                <strong>Stop notifications:</strong> turn them off in Settings or in your browser.
              </li>
              <li>
                <strong>Stop crash reports:</strong> switch off &ldquo;Send crash reports automatically&rdquo; in Settings,
                then Help &amp; feedback.
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
              it. Copies on your own devices stay until you sign out or clear your browser&apos;s data. Crash reports and
              your messages arrive as emails; we keep them only as long as we need them to fix the problem or answer you,
              and we delete your messages if you ask. Our providers may keep technical logs and backups for a limited time
              under their own policies.
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
