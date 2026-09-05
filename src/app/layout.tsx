import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Comfortaa } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/components/auth/auth-provider";
import { SyncProvider } from "@/components/auth/sync-provider";
import { AuthGate } from "@/components/auth/auth-gate";
import { SleepGate } from "@/components/sleep/sleep-gate";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { PwaLayer } from "@/components/pwa/pwa-layer";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
  display: "swap",
});

/** Rounded geometric display face — headings, numbers, the brand voice. */
const comfortaa = Comfortaa({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The UPSC Chronicle — Your Preparation, Documented",
  description:
    "A personal operating system for the UPSC journey. Document and visualize every day of preparation from Day 1 until final selection.",
  applicationName: "The UPSC Chronicle",
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
    title: "Chronicle",
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

// Apply the chosen appearance before paint to avoid a flash of the wrong look.
const themeScript = `
(function(){
  try {
    var s = localStorage.getItem('upsc-chronicle-surface') || 'white';
    var p = localStorage.getItem('upsc-chronicle-palette') || 'rose';
    document.documentElement.setAttribute('data-surface', s);
    document.documentElement.setAttribute('data-palette', p);
  } catch (e) {
    document.documentElement.setAttribute('data-surface','white');
    document.documentElement.setAttribute('data-palette','rose');
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
        className={`${geistSans.variable} ${geistMono.variable} ${comfortaa.variable} antialiased`}
      >
        <AuthProvider>
          <SyncProvider>
            <ConfirmProvider>
              <AuthGate>
                <SleepGate>
                  <AppShell>{children}</AppShell>
                </SleepGate>
              </AuthGate>
              <PwaLayer />
            </ConfirmProvider>
          </SyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
