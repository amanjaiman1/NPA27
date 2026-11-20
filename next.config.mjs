/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Screenshots on the public site are served as AVIF where the browser
    // supports it, WebP otherwise.
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // How long a tab reuses a page it already has from the server before
    // asking again. Next's defaults are five minutes for a page the app
    // warmed ahead of time and 30 seconds otherwise, so after a few minutes of
    // use every page change waited on the network again, which on a phone is
    // the slow part. Nothing the server sends is personal (each app page is
    // the same shell for everyone, filled in from the device; the Admin
    // Center loads its data from its API) and it only changes with a new
    // build, so pages stay reusable for half an hour, or five minutes for one
    // that was only opened.
    staleTimes: { dynamic: 300, static: 1800 },
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
      // The Performance Review moved to /performance-review when /reviews became
      // the public reviews page. Reminders and pushes already sent link to
      // /reviews?open=…; they still open the right review (the query is kept).
      { source: "/reviews", has: [{ type: "query", key: "open" }], destination: "/performance-review", permanent: false },
      // Public reviews lived at /testimonials for a short while.
      { source: "/testimonials", destination: "/reviews", permanent: true },
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

/**
 * Bundle analysis, for `npm run perf:bundle` (docs/performance-bundle-analysis.md).
 * Off unless asked for: ANALYZE=1 writes a treemap to .next/analyze/client.html,
 * ANALYZE=json the same as data. Production builds never load the analyzer.
 */
const analyze = process.env.ANALYZE;
const withAnalyzer = analyze
  ? (await import("@next/bundle-analyzer")).default({
      enabled: true,
      openAnalyzer: false,
      analyzerMode: analyze === "json" ? "json" : "static",
    })
  : (config) => config;

export default withAnalyzer(nextConfig);
