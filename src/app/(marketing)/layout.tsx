import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Analytics } from "@/components/marketing/analytics";
import { SiteServiceWorker } from "@/components/marketing/install-app";
import { JsonLd } from "@/components/seo/json-ld";
import { siteGraph } from "@/lib/seo/schema";

/**
 * The public website: home, features, free tools, guides and the trust pages.
 *
 * Everything under here is server-rendered and statically generated, so the
 * full content is in the HTML that crawlers and visitors receive. None of the
 * app's code (accounts, sync, the data store) is loaded on these pages. The
 * service worker is, once the page has loaded: it is what makes the site
 * installable as the app, and the pages already visited work offline.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    // `site-root` keeps the public site's rounded display face; the app sets
    // its headings in the text face (globals.css).
    <div className="site-root">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <JsonLd data={siteGraph()} />
      <Analytics />
      <SiteServiceWorker />
    </div>
  );
}
