#!/usr/bin/env node
/**
 * What each route's JavaScript is made of.
 *
 *     ANALYZE=json npx next build          # writes .next/analyze/client.html (JSON)
 *     node scripts/perf/bundle-report.mjs --out docs/perf/bundle-<label>.json
 *
 * Reads the analyzer's per-module sizes (gzip) and Next's manifests, and
 * reports, for the routes that matter, the first-load JavaScript and the
 * packages and app modules it is made of. `npm run perf:bundle` does both
 * steps. See docs/performance-bundle-analysis.md.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const analyzer = JSON.parse(readFileSync(join(root, ".next/analyze/client.html"), "utf8"));
const app = JSON.parse(readFileSync(join(root, ".next/app-build-manifest.json"), "utf8")).pages;
const build = JSON.parse(readFileSync(join(root, ".next/build-manifest.json"), "utf8"));

const chunkByFile = new Map(analyzer.map((c) => [c.label, c]));

/** Every module in a chunk, with the analyzer's gzip size. */
function modulesOf(chunk) {
  const outList = [];
  const walk = (node) => {
    if (node.groups?.length) node.groups.forEach(walk);
    else outList.push({ path: node.path ?? node.label, gzip: node.gzipSize ?? 0, parsed: node.parsedSize ?? 0 });
  };
  (chunk?.groups ?? []).forEach(walk);
  return outList;
}

/** "framer-motion", "@supabase/auth-js", or "app: src/lib/store.ts". */
function ownerOf(path) {
  const p = path.replace(/^\.\//, "");
  const nm = p.lastIndexOf("node_modules/");
  if (nm >= 0) {
    const rest = p.slice(nm + "node_modules/".length).split("/");
    return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
  }
  const src = p.indexOf("src/");
  if (src >= 0) {
    const parts = p.slice(src).split(/[/ ]/);
    // src/lib/x.ts, src/components/<area>, src/app/...
    if (parts[1] === "lib") return `app: src/lib/${parts[2]}`;
    if (parts[1] === "components") return `app: src/components/${parts[2]}`;
    return `app: ${parts.slice(0, 4).join("/")}`;
  }
  return `other: ${p.split("/").slice(0, 2).join("/")}`;
}

/** The chunks a route loads first: the root files, its layouts and the page. */
function firstLoadFiles(pageKey) {
  const files = new Set([...build.rootMainFiles, ...(build.polyfillFiles ?? [])]);
  const segments = pageKey.replace(/\/page$/, "").split("/").filter(Boolean);
  const layouts = ["/layout"];
  for (let i = 1; i <= segments.length; i++) layouts.push(`/${segments.slice(0, i).join("/")}/layout`);
  for (const key of [...layouts, pageKey]) for (const f of app[key] ?? []) files.add(f);
  return [...files].filter((f) => f.endsWith(".js") && !f.includes("polyfills"));
}

const ROUTES = {
  "/": "/(marketing)/page",
  "/welcome": "/(product)/(auth)/welcome/page",
  "/login": "/(product)/(auth)/login/page",
  "/dashboard": "/(product)/(app)/dashboard/page",
  "/journal": "/(product)/(app)/journal/page",
  "/wellbeing": "/(product)/(app)/wellbeing/page",
  "/goals": "/(product)/(app)/goals/page",
  "/roadmap": "/(product)/(app)/roadmap/page",
  "/habits": "/(product)/(app)/habits/page",
  "/revision": "/(product)/(app)/revision/page",
  "/performance-review": "/(product)/(app)/performance-review/page",
  "/diary": "/(product)/(app)/diary/page",
  "/coach": "/(product)/(app)/coach/page",
  "/settings": "/(product)/(app)/settings/page",
  "/knowledge-graph": "/(product)/(app)/knowledge-graph/page",
  "/admin": "/(product)/(admin)/admin/page",
};

const kb = (b) => Math.round((b / 1024) * 10) / 10;
const report = { routes: {}, packages: {}, appShell: null };

for (const [route, key] of Object.entries(ROUTES)) {
  const files = firstLoadFiles(key);
  const owners = new Map();
  let total = 0;
  for (const f of files) {
    const chunk = chunkByFile.get(f);
    total += chunk?.gzipSize ?? 0;
    for (const m of modulesOf(chunk)) owners.set(ownerOf(m.path), (owners.get(ownerOf(m.path)) ?? 0) + m.gzip);
  }
  const top = [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([name, size]) => ({ name, kb: kb(size) }));
  report.routes[route] = { firstLoadKb: kb(total), chunks: files.length, top };
}

// Packages across every client chunk, with the number of chunks that carry them.
const pkg = new Map();
for (const chunk of analyzer) {
  for (const m of modulesOf(chunk)) {
    const name = ownerOf(m.path);
    if (name.startsWith("app:")) continue;
    const entry = pkg.get(name) ?? { kb: 0, chunks: new Set() };
    entry.kb += m.gzip;
    entry.chunks.add(chunk.label);
    pkg.set(name, entry);
  }
}
report.packages = Object.fromEntries(
  [...pkg.entries()].sort((a, b) => b[1].kb - a[1].kb).slice(0, 20).map(([name, v]) => [name, { kb: kb(v.kb), chunks: v.chunks.size }]),
);

for (const [route, r] of Object.entries(report.routes)) {
  console.log(`${route.padEnd(20)} ${String(r.firstLoadKb).padStart(6)} KB gz  ${r.top.slice(0, 6).map((t) => `${t.name} ${t.kb}`).join(" · ")}`);
}
console.log("\nLargest packages (all client chunks, gzip):");
for (const [name, v] of Object.entries(report.packages)) console.log(`  ${name.padEnd(28)} ${String(v.kb).padStart(6)} KB in ${v.chunks} chunk(s)`);

if (out) {
  mkdirSync(dirname(join(root, out)), { recursive: true });
  writeFileSync(join(root, out), JSON.stringify(report, null, 2) + "\n");
  console.log(`\nWrote ${out}`);
}
