import type { Metadata, Viewport } from "next";
import { Comfortaa, Poppins } from "next/font/google";
import "./globals.css";
import { INDEXABLE, SITE, SITE_URL } from "@/lib/seo/config";
import { PAGES } from "@/lib/seo/pages";

/* Two faces, and only two — both geometric, so the whole app speaks with one
   voice. Poppins (neutral, legible at UI sizes) is the text face everywhere;
   inside the app it sets the headings and figures too. Comfortaa (rounded,
   characterful) is the brand: the wordmark, and the public site's headings.
   `--font-display` points at Comfortaa by default (globals.css) and at
   Poppins inside the app shell. */

/** Brand face — the wordmark, and display type on the public site. */
const comfortaa = Comfortaa({
  subsets: ["latin"],
  variable: "--font-brand",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Text face — body copy, labels, controls, tabular data. */
const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

/**
 * Defaults for every page. Public pages override title, description and
 * canonical through `pageMetadata`; the app and its sign-in screens are
 * marked noindex in `(product)/layout.tsx`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: PAGES.home.title, template: `%s | ${SITE.name}` },
  description: PAGES.home.description,
  applicationName: SITE.name,
  category: "education",
  // Previews and local builds must never be indexed (see lib/seo/config.ts).
  robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: SITE.locale,
    images: [{ ...SITE.ogImage }],
  },
  twitter: { card: "summary_large_image" },
  // Installable app metadata
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DoOrDie",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  // Search engine ownership checks. Google re-checks its token from time to
  // time, so removing it un-verifies the site.
  verification: {
    google: SITE.googleVerification,
    ...(SITE.bingVerification ? { other: { "msvalidate.01": SITE.bingVerification } } : {}),
  },
};

export const viewport: Viewport = {
  // The Lavender canvas, the default; ThemeColorSync follows the theme once
  // the app loads.
  themeColor: "#f7f6fc",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available — an installed app shouldn't cost accessibility.
  maximumScale: 5,
  userScalable: true,
};

/**
 * Apply the signed-in account's appearance before paint, to avoid a flash of
 * the wrong look. Appearance is per account: the keys carry the account id,
 * read here from the saved session (or "local" when accounts are off). With no
 * session, the defaults — so a sign-in screen never wears the last person's look.
 */
const cloud = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const themeScript = `
(function(){
  var d = document.documentElement;
  try {
    var id = ${cloud ? "null" : "'local'"};
    if (!id) {
      var s = JSON.parse(localStorage.getItem('upsc-chronicle-auth') || 'null');
      id = s && s.user && s.user.id ? s.user.id : null;
    }
    var get = function (k, f) { return (id && localStorage.getItem('upsc-chronicle-' + k + ':' + id)) || f; };
    // Lavender, Light or Dark. Values older versions saved still paint the
    // theme they now mean (lib/theme.ts, legacyThemeMode): Blue Glass is
    // Light, Auto is whichever theme the device shows, and a browser that
    // last ran the five-surface version has only the old key, where Ivory
    // meant light. Nothing saved, or no account, is the default, Lavender.
    var mode = get('theme', '');
    if (!mode) { var old = get('surface', ''); mode = old ? (old === 'white' ? 'light' : 'dark') : 'lavender'; }
    if (mode === 'system') mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (mode === 'blue') mode = 'light';
    if (mode !== 'dark' && mode !== 'light') mode = 'lavender';
    d.setAttribute('data-surface', mode === 'dark' ? 'black' : mode === 'light' ? 'white' : 'lavender');
    d.setAttribute('data-theme-mode', mode);
    if (get('transparency', '') === 'reduced') d.setAttribute('data-transparency', 'reduced');
  } catch (e) {
    d.setAttribute('data-surface','lavender');
  }
})();
`;

// `beforeinstallprompt` can fire before React hydrates, and the event is only
// usable if it was captured. Stash the earliest one for the install UI to use.
const installCaptureScript = `
(function(){
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    window.__chronicleInstallEvent = e;
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-surface="lavender" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: installCaptureScript }} />
      </head>
      <body
        className={`${poppins.variable} ${comfortaa.variable} antialiased`}
      >
        {/* Accounts, dialogs and the PWA layer load in (product)/layout.tsx,
            so the public pages ship none of that JavaScript. */}
        {children}
      </body>
    </html>
  );
}
