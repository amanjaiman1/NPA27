#!/usr/bin/env node
/**
 * Technical SEO audit of a production build, run locally.
 *
 *     npm run seo:audit                 # builds as production, then audits
 *     npm run seo:audit -- --no-build   # audits the last build
 *     npm run seo:audit -- --out docs/seo-research/audit.md
 *
 * The build uses a placeholder production domain (https://doordie.example) and
 * the mock Supabase, so canonical URLs, robots rules and the sign-in screens
 * all behave as they do in production. Run `npm run build` afterwards before
 * using the build for anything else.
 *
 * Checks, for every URL in the sitemap: status, one H1, title and description
 * (present, unique, sensible length), canonical, robots, Open Graph, JSON-LD
 * that parses, images with alt text, internal links that resolve, no orphan
 * pages, and how much JavaScript the page loads (and that none of it is the
 * app's account code). Then that private routes are noindex and absent from
 * the sitemap, that unknown URLs return 404, and that the API says noindex.
 * Exits non-zero if anything fails.
 */

import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3400;
const APP = `http://localhost:${PORT}`;
const SITE = "https://doordie.example";
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;

const PRIVATE = ["/dashboard", "/journal", "/subjects", "/revision", "/mocks", "/settings", "/announcements", "/welcome", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/callback", "/admin", "/admin/users", "/admin/audit"];

const mockEnv = Object.fromEntries(
  execFileSync("node", ["scripts/mock-supabase.mjs", "--print-env"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.split(/=(.*)/s).slice(0, 2)),
);
const env = {
  ...process.env,
  ...mockEnv,
  NEXT_PUBLIC_SITE_URL: SITE,
  VERCEL_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
};

const children = [];
function start(cmd, argv, ready) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes(ready)) resolve();
    });
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => reject(new Error(`${cmd} exited (${code}):\n${out.slice(-1500)}`)));
  });
}

/* ── tiny HTML helpers (no dependencies) ─────────────────────── */

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? decode(m[1]) : null;
};
const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
const meta = (html, key, value) =>
  tags(html, "meta").find((t) => (attr(t, key) ?? "").toLowerCase() === value.toLowerCase());
const linkRel = (html, rel) => tags(html, "link").find((t) => (attr(t, "rel") ?? "").toLowerCase() === rel);

function analyse(html) {
  const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "");
  const description = attr(meta(html, "name", "description") ?? "", "content");
  const canonical = attr(linkRel(html, "canonical") ?? "", "href");
  const robots = attr(meta(html, "name", "robots") ?? "", "content");
  const ogImage = attr(meta(html, "property", "og:image") ?? "", "content");
  const ogTitle = attr(meta(html, "property", "og:title") ?? "", "content");
  const twitter = attr(meta(html, "name", "twitter:card") ?? "", "content");
  const h1 = (html.match(/<h1\b/gi) ?? []).length;
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const imgs = tags(html, "img");
  const missingAlt = imgs.filter((t) => attr(t, "alt") === null).length;
  const links = [...new Set(tags(html, "a").map((t) => attr(t, "href")).filter(Boolean))];
  // `nomodule` scripts are legacy polyfills that modern browsers never download.
  const scripts = tags(html, "script")
    .filter((t) => !/\snomodule\b/i.test(t))
    .map((t) => attr(t, "src"))
    .filter(Boolean);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  return { title, description, canonical, robots, ogImage, ogTitle, twitter, h1, jsonLd, imgs: imgs.length, missingAlt, links, scripts, words: text.split(" ").filter(Boolean).length };
}

/* ── run ─────────────────────────────────────────────────────── */

const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);
const local = (url) => url.replace(SITE, APP);

async function get(path, init) {
  const res = await fetch(path.startsWith("http") ? path : `${APP}${path}`, { redirect: "manual", ...init });
  return { res, body: await res.text() };
}

async function main() {
  console.log("Starting the mock Supabase…");
  await start("node", ["scripts/mock-supabase.mjs"], "Mock Supabase on");
  if (!args.includes("--no-build")) {
    console.log("Building as production (a minute or two)…");
    execFileSync("npx", ["next", "build"], { cwd: root, env, stdio: "ignore" });
  }
  await start("npx", ["next", "start", "-p", String(PORT)], "Ready");

  // robots.txt
  const robots = await get("/robots.txt");
  if (robots.res.status !== 200) fail(`robots.txt returned ${robots.res.status}`);
  if (!robots.body.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail("robots.txt does not point to the sitemap");
  if (/Disallow:\s*\/\s*$/m.test(robots.body)) fail("robots.txt blocks the whole site in production");

  // sitemap.xml
  const sitemap = await get("/sitemap.xml");
  if (sitemap.res.status !== 200) fail(`sitemap.xml returned ${sitemap.res.status}`);
  const entries = [...sitemap.body.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => ({
    url: m[1],
    lastmod: m[2] ?? null,
  }));
  if (!entries.length) fail("sitemap.xml lists no URLs");

  const pages = [];
  const scriptCache = new Map();
  for (const { url, lastmod } of entries) {
    if (!url.startsWith(`${SITE}/`) && url !== SITE && url !== `${SITE}/`) fail(`sitemap URL not on the canonical domain: ${url}`);
    if (!lastmod) warn(`no lastmod for ${url}`);
    const path = new URL(url).pathname;
    if (PRIVATE.some((p) => path === p || path.startsWith(`${p}/`))) fail(`private route in sitemap: ${path}`);
    const { res, body } = await get(local(url));
    const a = analyse(body);
    pages.push({ url, path, status: res.status, ...a });
    if (res.status !== 200) fail(`${path} returned ${res.status}`);
    if (a.h1 !== 1) fail(`${path} has ${a.h1} H1 elements`);
    if (!a.title) fail(`${path} has no title`);
    if (a.title.length > 70) warn(`${path} title is ${a.title.length} characters: "${a.title}"`);
    if (!a.description) fail(`${path} has no meta description`);
    else if (a.description.length < 70 || a.description.length > 175)
      warn(`${path} description is ${a.description.length} characters`);
    if (a.canonical !== url && a.canonical !== url.replace(/\/$/, "")) fail(`${path} canonical is ${a.canonical}, expected ${url}`);
    if (a.robots && /noindex/i.test(a.robots)) fail(`${path} is noindex but listed in the sitemap`);
    if (!a.ogImage?.startsWith(SITE)) fail(`${path} og:image missing or not absolute (${a.ogImage})`);
    if (!a.ogTitle) fail(`${path} has no og:title`);
    if (a.twitter !== "summary_large_image") fail(`${path} twitter:card is ${a.twitter}`);
    if (a.missingAlt) fail(`${path} has ${a.missingAlt} image(s) without alt`);
    if (!a.jsonLd.length) warn(`${path} has no JSON-LD`);
    for (const block of a.jsonLd) {
      try {
        JSON.parse(block);
      } catch {
        fail(`${path} has JSON-LD that does not parse`);
      }
    }
    let js = 0;
    let jsGz = 0;
    let appCode = false;
    for (const src of a.scripts) {
      if (!scriptCache.has(src)) {
        const s = await get(src);
        scriptCache.set(src, s.body);
      }
      const code = scriptCache.get(src);
      js += Buffer.byteLength(code);
      jsGz += gzipSync(code).length;
      if (/supabase|persist\.rehydrate|upsc-chronicle-store/.test(code)) appCode = true;
    }
    Object.assign(pages.at(-1), { jsKb: Math.round(js / 1024), jsGzKb: Math.round(jsGz / 1024), appCode });
    if (appCode) fail(`${path} loads the app's account or store code`);
  }

  // duplicates
  for (const key of ["title", "description"]) {
    const seen = new Map();
    for (const p of pages) {
      if (!p[key]) continue;
      if (seen.has(p[key])) fail(`duplicate ${key}: ${p.path} and ${seen.get(p[key])}`);
      seen.set(p[key], p.path);
    }
  }

  // internal links: resolve, and find orphans
  const linkedFrom = new Map();
  const checked = new Map();
  for (const p of pages) {
    for (const href of p.links) {
      if (/^(mailto:|tel:|#)/.test(href)) continue;
      const u = new URL(href, `${SITE}${p.path}`);
      if (u.origin !== SITE) continue;
      const path = u.pathname;
      if (path !== p.path) linkedFrom.set(path, (linkedFrom.get(path) ?? 0) + 1);
      if (!checked.has(path)) {
        const { res } = await get(path);
        checked.set(path, res.status);
      }
      const status = checked.get(path);
      if (status >= 400) fail(`broken link on ${p.path}: ${path} (${status})`);
    }
  }
  for (const p of pages) if (p.path !== "/" && !linkedFrom.get(p.path)) fail(`orphan page (no internal links to it): ${p.path}`);

  // private routes: reachable, but noindex
  for (const path of PRIVATE) {
    const { res, body } = await get(path);
    const a = analyse(body);
    if (!a.robots || !/noindex/i.test(a.robots)) fail(`private route ${path} is not noindex (${res.status})`);
  }

  // unknown URL → real 404, noindex
  const missing = await get("/this-page-does-not-exist");
  if (missing.res.status !== 404) fail(`unknown URL returned ${missing.res.status}, expected 404`);
  if (!/noindex/i.test(analyse(missing.body).robots ?? "")) fail("404 page is not noindex");

  // API responses say noindex
  const api = await get("/api/push/dispatch");
  if (!/noindex/i.test(api.res.headers.get("x-robots-tag") ?? "")) fail("API responses lack X-Robots-Tag: noindex");
  const adminApi = await get("/api/admin/me");
  if (adminApi.res.status !== 401) fail(`/api/admin/me without a session returned ${adminApi.res.status}, expected 401`);
  if (!/noindex/i.test(adminApi.res.headers.get("x-robots-tag") ?? "")) fail("the Admin API lacks X-Robots-Tag: noindex");

  /* ── report ── */
  const lines = [];
  lines.push(`# SEO audit — ${new Date().toISOString().slice(0, 10)}`, "");
  lines.push(`Production build with canonical domain \`${SITE}\`. ${pages.length} URLs in the sitemap, ${checked.size} internal link targets checked, ${PRIVATE.length} private routes checked.`, "");
  lines.push("| Page | Status | Title (chars) | Description (chars) | H1 | JSON-LD types | Words | JS (gzip) |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const p of pages) {
    const types = p.jsonLd
      .flatMap((b) => {
        try {
          const j = JSON.parse(b);
          return (j["@graph"] ?? [j]).map((n) => n["@type"]);
        } catch {
          return ["invalid"];
        }
      })
      .join(", ");
    lines.push(`| \`${p.path}\` | ${p.status} | ${p.title.length} | ${p.description?.length ?? 0} | ${p.h1} | ${types} | ${p.words} | ${p.jsGzKb} KB |`);
  }
  lines.push("", failures.length ? `## Failures (${failures.length})` : "## Failures: none", "");
  for (const f of failures) lines.push(`- ${f}`);
  lines.push("", warnings.length ? `## Warnings (${warnings.length})` : "## Warnings: none", "");
  for (const w of warnings) lines.push(`- ${w}`);
  const report = lines.join("\n") + "\n";
  console.log(report);
  if (outFile) {
    mkdirSync(dirname(join(root, outFile)), { recursive: true });
    writeFileSync(join(root, outFile), report);
  }
  return failures.length;
}

main()
  .then((n) => {
    children.forEach((c) => c.kill("SIGTERM"));
    process.exit(n ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    children.forEach((c) => c.kill("SIGTERM"));
    process.exit(1);
  });
