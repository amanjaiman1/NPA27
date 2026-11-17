# SEO setup guide

The manual steps that make the public site findable once this code is deployed:
the domain, environment variables, Supabase, Google Search Console, Bing, and
(optionally) Google Analytics. Then the checks to run after each deploy and a
routine for keeping an eye on it.

Nothing here costs money. Search engines decide when and how they rank pages;
these steps make sure they can find, read and trust the site, but nobody can
guarantee positions or traffic.

## What changed for people who already use the app

- **The dashboard is now at `/dashboard`.** The home page `/` is the public
  site. Someone signed in who opens `/` (a bookmark, typing the address, or the
  installed app) is sent straight to `/dashboard`, so nobody has to change
  anything.
- **The installed app** now starts at `/dashboard`. Copies installed earlier may
  keep opening the old address for a while; the redirect above takes them to the
  dashboard either way.
- **The service worker cache** was renewed (version 8), so every device fetches
  the new pages the first time it opens the site.

## 1. Choose the main domain

Search engines should see one address for the site.

1. In Vercel, open the project → **Settings → Domains**.
2. If you have your own domain (for example from GoDaddy), make sure it is listed
   and shows **Valid Configuration**. Decide between `example.com` and
   `www.example.com`; either is fine. Edit the other one and set it to
   **Redirect to** the main one (permanent, 308).
3. If you don't have your own domain, the `….vercel.app` production address is
   the main domain. You can add your own domain later; repeat these steps then.

## 2. Set the environment variables

Vercel → project → **Settings → Environment Variables**. Add these for the
**Production** environment. Variables starting with `NEXT_PUBLIC_` are built into
the pages, so **redeploy after changing any of them** (Deployments → the latest
production deployment → ⋯ → Redeploy).

| Variable | Needed? | Example | What it does |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Strongly recommended | `https://example.com` | The address used in canonical links, the sitemap, robots.txt and social previews. Use the main domain from step 1, with `https://` and no trailing slash. Without it, Vercel's production domain is used, which may not be the one you want. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Recommended | `hello@example.com` | Shown on `/contact`, which the privacy policy and terms point to. It is the only way the site offers to reach you, so without it visitors have no contact route. The site names no person, so use an address that doesn't show your name, for example a separate one made for DoOrDie. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional | `G-XXXXXXXXXX` | Turns on Google Analytics, with a consent banner, on the public pages only. See step 6. |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Optional | `1A2B3C…` | Bing Webmaster Tools' verification code. See step 5. |

Preview deployments are never indexed, whatever these are set to: they answer
`noindex` and their robots.txt blocks crawling.

## 3. Update Supabase

Supabase → **Authentication → URL Configuration**:

| Setting | Value |
| --- | --- |
| Site URL | The main domain, e.g. `https://example.com` |
| Redirect URLs | `https://example.com/auth/callback` and `https://example.com/reset-password` (keep the `http://localhost:3000` pair for local work) |

The paths haven't changed, so if your domain hasn't changed either there is
nothing new to add. If an email link ever lands on the home page instead (this
happens when its address isn't in the Redirect URLs list), the home page now
passes it on to the right screen.

## 4. Google Search Console

The site already carries your Google verification tag (added in PR #40), so the
property you verified with it stays verified.

1. Open [Search Console](https://search.google.com/search-console). If the
   verified property is not the main domain from step 1, add the main domain as
   a new property:
   - **Domain property** (recommended for your own domain): Search Console gives
     a TXT record. Add it wherever the domain's DNS is managed: GoDaddy's DNS
     page (record type TXT, name `@`), or Vercel's Domains page if the domain
     uses Vercel's nameservers. It covers `www`, the bare domain and
     `http`/`https` together.
   - **URL-prefix property**: choose "HTML tag" and send the code to whoever
     maintains the site, to add it next to the existing one in
     `src/lib/seo/config.ts`. Keep the old code; removing it un-verifies the old
     property.
2. **Sitemaps** → enter `sitemap.xml` → Submit. Expect "Success" and 23
   discovered pages.
3. **URL Inspection** → paste the home page address → **Request indexing**. Do
   the same for the five feature pages (`/upsc-syllabus-tracker`,
   `/daily-study-tracker`, `/upsc-revision-tracker`, `/upsc-progress-tracker`,
   `/upsc-study-planner`). There is a small daily limit; spread the rest over a
   few days or let the sitemap do it.
4. After a week or two, open **Indexing → Pages**. Expect:
   - The public pages moving to **Indexed** over the following weeks.
   - Sign-in and app pages under **Excluded by 'noindex' tag**. That is
     intended: they are private.
   - **Discovered – currently not indexed** for some pages at first. This is
     normal for a new site and clears with time and links.
5. **Settings → Associations**: link the property to Google Analytics if you use
   step 6.

## 5. Bing Webmaster Tools

Bing also supplies Yahoo's results.

1. Open [Bing Webmaster Tools](https://www.bing.com/webmasters) and sign in.
2. Choose **Import from Google Search Console**. It copies the verified site and
   its sitemap, and needs no code.
3. Or add the site by hand: choose the **HTML Meta Tag** option and copy only
   the `content` value of the `msvalidate.01` tag. Set it as
   `NEXT_PUBLIC_BING_SITE_VERIFICATION` (step 2), redeploy, then press Verify.
   Then submit `https://example.com/sitemap.xml` under **Sitemaps**.

## 6. Google Analytics 4 (optional)

Analytics only loads for visitors who press **Allow analytics** in the banner,
only on the public pages and sign-in screens, and never inside anyone's
account. If you skip this step there is no banner and no tracking at all.

1. At [analytics.google.com](https://analytics.google.com): **Admin → Create →
   Property**. Time zone India, currency Indian rupee.
2. Add a **Web** data stream with the main domain. Copy its **Measurement ID**
   (`G-…`) into `NEXT_PUBLIC_GA_MEASUREMENT_ID` (Production only, so previews
   don't count) and redeploy.
3. In the data stream, open **Enhanced measurement → ⚙ → Page views → Show
   advanced settings** and **untick "Page changes based on browser history
   events"**. The site sends its own page views; leaving this on counts pages
   twice.
4. **Admin → Data collection and modification → Data retention**: set event data
   retention to 14 months (the default is 2), so you can compare months.
5. **Admin → Data display → Key events → New key event**: name it `sign_up`.
6. **Admin → Data display → Custom definitions → Create custom dimension**
   (scope: Event) for the parameters `cta`, `tool` and `action`, so the reports
   can break the events down.

What the site sends:

| Event | When | Parameters |
| --- | --- | --- |
| `page_view` | Each public page viewed | page path and title |
| `cta_click` | A sign-up button is pressed | `cta` (which button, e.g. `cta_hero`, `cta_header`, `cta_article_<guide>`), `link_url`, `page_path` |
| `tool_use` | The countdown planner is used, the revision dates are copied or downloaded, or a template is printed | `tool`, `action` |
| `sign_up` | The sign-up form succeeds | `method: email` |

`sign_up` is reliable while "Confirm email" is on in Supabase (the "check your
inbox" screen stays open). If you turn confirmation off, the app opens at once
and the event may sometimes be lost before it is sent; count sign-ups in
Supabase → Authentication → Users instead.

## 7. Check the live site after deploying

Replace `example.com` with the main domain.

| Check | Where | Expect |
| --- | --- | --- |
| robots.txt | `https://example.com/robots.txt` | `Allow: /`, `Disallow: /api/` and a `Sitemap:` line on your domain |
| Sitemap | `https://example.com/sitemap.xml` | 23 addresses, all on your domain |
| A page as Google sees it | Search Console → URL Inspection → **Test live URL** → View tested page | The page's text is in the HTML, and the canonical is the page's own address |
| Structured data | [Rich Results Test](https://search.google.com/test/rich-results) on `/upsc-syllabus-tracker` and a guide | Breadcrumbs found on both; Article found on the guide; no errors |
| Structured data, everything | [Schema Markup Validator](https://validator.schema.org/) on `/` | Organization, WebSite and WebApplication with no errors |
| Speed | [PageSpeed Insights](https://pagespeed.web.dev/) on `/` and a guide, mobile | Performance, Accessibility, Best Practices and SEO scores. "Field data" appears only once enough Chrome users have visited. |
| Social card | Paste a page link into WhatsApp or Telegram | The DoOrDie image, title and description |
| Private pages | URL Inspection on `/dashboard` | "Excluded by 'noindex' tag" |

The home page's WebApplication data will not show as a rich result in the Rich
Results Test. Google only shows software-app rich results with ratings or
reviews, and DoOrDie has none it could honestly publish. The data still tells
search engines what the product is. FAQ rich results are no longer shown by
Google, so the pages have none.

Run the same checks locally before a big change with `npm run seo:audit`
(see the README).

## 8. Keep an eye on it

**First two weeks:** the sitemap shows "Success" and the home page is indexed
(URL Inspection).

**Monthly, about 30 minutes:**

- Search Console → **Performance**: which searches and pages get impressions
  and clicks. Compare with [`SEO_KEYWORD_MAP.md`](SEO_KEYWORD_MAP.md) and follow
  the "Search Console signals" rules in
  [`SEO_CONTENT_ROADMAP.md`](SEO_CONTENT_ROADMAP.md).
- **Indexing → Pages**: any public page not indexed, and why.
- **Experience → Core Web Vitals**: once there is enough data, any page marked
  "Poor" or "Needs improvement".
- Supabase → **Usage** and Resend → **Usage**: more visitors means more
  sign-ups, and both free plans have limits (see below).

**Every three or four months:** `npm run seo:suggest` for fresh search
suggestions, and `npm run seo:audit` after content changes.

**When UPSC publishes anything** (the CSE 2027 notification is due on 13 January
2027): update the countdown page the same day.

## Free-plan limits to watch

The site was sized for a small group of accounts on free plans. If the public
site brings many sign-ups, these are the limits that will be reached first:

| Service | Free limit | What happens at the limit |
| --- | --- | --- |
| Supabase database | 500 MB | Supabase can switch the database to read-only, so new saves fail |
| Supabase egress | 5 GB a month | Supabase warns you, and can restrict the project if usage stays over |
| Resend email | 100 a day, 3,000 a month | Confirmation and password-reset emails stop until the limit resets |
| Supabase auth emails over custom SMTP | 30 an hour by default (adjustable under Authentication → Rate Limits) | Further sign-ups in that hour get a rate-limit error |

Supabase → Organization → **Usage** and Resend → **Usage** show where you stand.
If sign-ups grow beyond these, turn off "Allow new users to sign up" in
Supabase until you decide whether to upgrade.
