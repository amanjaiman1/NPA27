/**
 * The site's main address, for the links in account emails (confirming an
 * email, resetting a password; see `authRedirectUrl` in src/lib/supabase.ts).
 * `NEXT_PUBLIC_SITE_URL` when it's set; otherwise, on Vercel's production
 * deployment, its production domain, the same fallback the canonical links
 * use (src/lib/seo/config.ts). Empty for previews and local builds without
 * it: their links come back to the address in use. Built into the pages.
 */
function emailLinkOrigin() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : "");
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
  } catch {
    return "";
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_EMAIL_LINK_ORIGIN: emailLinkOrigin(),
  },
  images: {
    // Screenshots on the public site are served as AVIF where the browser
    // supports it, WebP otherwise.
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [
      // The Selection Archive is retired. Its stages stay in the account,
      // untouched; an old bookmark lands on the Command Center.
      { source: "/archive", destination: "/dashboard", permanent: false },
      // The Milestone Timeline is retired too. Stored milestones stay as they were.
      { source: "/timeline", destination: "/dashboard", permanent: false },
      // Reflections became the Personal Diary: same entries, new home.
      { source: "/reflections", destination: "/diary", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // JSON from the API is never a search result.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        // The worker must never be served stale, or updates can't roll out.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
