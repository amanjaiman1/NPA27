/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig;
