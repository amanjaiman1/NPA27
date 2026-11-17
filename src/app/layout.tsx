import type { Metadata, Viewport } from "next";
import { Comfortaa, Poppins } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { PwaLayer } from "@/components/pwa/pwa-layer";

/* Two faces, and only two — both geometric, so the whole app speaks with one
   voice: Comfortaa for display (rounded, characterful) and Poppins for
   everything else (neutral geometric, legible at UI sizes). */

/** Display face — headings, big numbers, the brand. */
const comfortaa = Comfortaa({
  subsets: ["latin"],
  variable: "--font-display",
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

export const metadata: Metadata = {
  title: "DoOrDie — Your Preparation, Documented",
  description:
    "A personal operating system for the UPSC journey. Document and visualize every day of preparation from Day 1 until final selection.",
  applicationName: "DoOrDie",
  keywords: [
    "UPSC",
    "Civil Services",
    "study journal",
    "preparation tracker",
    "analytics",
  ],
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
};

export const viewport: Viewport = {
  themeColor: "#f6f4f0",
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
    d.setAttribute('data-surface', get('surface', 'white'));
    d.setAttribute('data-palette', get('palette', 'rose'));
    d.setAttribute('data-wallpaper', get('wallpaper', 'none'));
    d.style.setProperty('--wp-dim', get('wallpaper-dim', '0'));
  } catch (e) {
    d.setAttribute('data-surface','white');
    d.setAttribute('data-palette','rose');
    d.setAttribute('data-wallpaper','none');
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
    <html lang="en" data-surface="white" data-palette="rose" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: installCaptureScript }} />
      </head>
      <body
        className={`${poppins.variable} ${comfortaa.variable} antialiased`}
      >
        <AuthProvider>
          <ConfirmProvider>
            {children}
            <PwaLayer />
          </ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
