import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/components/auth/auth-provider";
import { SyncProvider } from "@/components/auth/sync-provider";
import { AuthGate } from "@/components/auth/auth-gate";

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

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
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
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  width: "device-width",
  initialScale: 1,
};

// Apply the chosen appearance before paint to avoid a flash of the wrong look.
const themeScript = `
(function(){
  try {
    var s = localStorage.getItem('upsc-chronicle-surface') || 'black';
    var p = localStorage.getItem('upsc-chronicle-palette') || 'rose';
    document.documentElement.setAttribute('data-surface', s);
    document.documentElement.setAttribute('data-palette', p);
  } catch (e) {
    document.documentElement.setAttribute('data-surface','black');
    document.documentElement.setAttribute('data-palette','rose');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-surface="black" data-palette="rose" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} grain antialiased`}
      >
        <AuthProvider>
          <SyncProvider>
            <AuthGate>
              <AppShell>{children}</AppShell>
            </AuthGate>
          </SyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
