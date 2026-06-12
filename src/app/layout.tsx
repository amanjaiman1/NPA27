import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

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

// Set theme before paint to avoid a flash of the wrong theme.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('upsc-chronicle-theme');
    if (!t) { t = 'dark'; }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme','dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} grain antialiased`}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
