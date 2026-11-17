#!/usr/bin/env node
/**
 * Keyword research helper: collects real search suggestions for a list of
 * seed phrases, so the keyword map in docs/SEO_KEYWORD_MAP.md is built from
 * what people actually type rather than guesses.
 *
 *     node scripts/seo-suggest.mjs                 # writes docs/seo-research/suggestions-<yyyy-mm>.json
 *     node scripts/seo-suggest.mjs --out file.json
 *
 * Sources: Google's and Bing's public autocomplete endpoints, India market.
 * Autocomplete shows that a phrase is searched, not how often — no volumes
 * come from here, and none should be inferred. The endpoints are unofficial,
 * so the script is deliberately slow (one request at a time, with a pause).
 * Run it every few months to see how demand is shifting.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const month = new Date().toISOString().slice(0, 7);
const outArg = process.argv.indexOf("--out");
const out = outArg > 0 ? process.argv[outArg + 1] : join(root, "docs", "seo-research", `suggestions-${month}.json`);

/** Seed phrases, grouped by the cluster they explore. */
const SEEDS = {
  product: [
    "upsc tracker",
    "upsc preparation tracker",
    "upsc study tracker",
    "upsc preparation app",
    "upsc app",
    "best app for upsc preparation",
    "ias preparation tracker",
    "ias study planner",
    "civil services preparation tracker",
    "upsc productivity",
    "upsc dashboard",
  ],
  syllabus: [
    "upsc syllabus tracker",
    "upsc syllabus checklist",
    "upsc syllabus progress",
    "upsc prelims syllabus tracker",
    "upsc mains syllabus tracker",
    "upsc optional syllabus tracker",
    "upsc syllabus topic wise",
    "upsc gs syllabus",
  ],
  planning: [
    "upsc study planner",
    "upsc planner",
    "upsc timetable",
    "upsc daily timetable",
    "upsc study timetable",
    "upsc daily planner",
    "upsc weekly plan",
    "upsc monthly plan",
    "upsc study schedule",
    "upsc study plan",
    "upsc daily target",
    "upsc study hours",
    "how many hours to study for upsc",
  ],
  revision: [
    "upsc revision tracker",
    "upsc revision planner",
    "upsc revision strategy",
    "upsc revision schedule",
    "spaced repetition upsc",
    "upsc revision timetable",
    "how to revise upsc syllabus",
  ],
  analytics: [
    "upsc progress tracker",
    "upsc mock test tracker",
    "upsc mock test analysis",
    "upsc mistake notebook",
    "upsc error log",
    "upsc habit tracker",
    "upsc study log",
    "upsc study diary",
    "upsc journal",
    "upsc consistency",
  ],
  informational: [
    "how to track upsc preparation",
    "how to make upsc study plan",
    "how to start upsc preparation",
    "how to maintain consistency in upsc preparation",
    "how to analyse mock test upsc",
    "how to track study hours",
    "how to prepare for upsc",
  ],
  templates: [
    "upsc tracker excel",
    "upsc tracker sheet",
    "upsc notion template",
    "upsc tracker pdf",
    "upsc planner pdf",
    "upsc syllabus pdf",
    "upsc study planner template",
  ],
  calendar: ["upsc prelims 2027", "days left for upsc prelims", "upsc calendar 2027", "upsc countdown"],
  hindiLatin: [
    "upsc ki taiyari kaise kare",
    "upsc ki taiyari",
    "upsc ka syllabus",
    "upsc time table hindi",
    "upsc preparation hindi",
    "upsc tracker hindi",
  ],
  hindi: ["यूपीएससी की तैयारी कैसे करें", "यूपीएससी सिलेबस", "यूपीएससी टाइम टेबल", "आईएएस की तैयारी"],
};

/** Seeds also expanded with a–z, to surface the long tail. */
const ALPHABET_SEEDS = ["upsc tracker", "upsc syllabus tracker", "upsc study planner", "upsc preparation", "upsc revision"];
const QUALIFIER_SEEDS = ["upsc tracker for", "upsc study plan for", "upsc timetable for", "upsc preparation for"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function google(q, hl) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${hl}&gl=in&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (keyword research)" } });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return Array.isArray(body?.[1]) ? body[1] : [];
}

async function bing(q) {
  const url = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}&mkt=en-IN`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return Array.isArray(body?.[1]) ? body[1] : [];
}

async function main() {
  const results = { collectedAt: new Date().toISOString(), market: "India (gl=in, mkt=en-IN)", note: "Autocomplete suggestions only. They show that a phrase is searched, not how often.", clusters: {} };
  let requests = 0;
  for (const [cluster, seeds] of Object.entries(SEEDS)) {
    results.clusters[cluster] = {};
    for (const seed of seeds) {
      const hl = cluster === "hindi" ? "hi" : "en";
      const g = await google(seed, hl);
      await sleep(250);
      const b = cluster === "hindi" ? [] : await bing(seed);
      await sleep(250);
      requests += 2;
      results.clusters[cluster][seed] = { google: g, bing: b.filter((s) => /upsc|ias|civil/i.test(s)) };
    }
  }
  results.longTail = {};
  for (const seed of [...ALPHABET_SEEDS, ...QUALIFIER_SEEDS]) {
    const found = new Set();
    const letters = QUALIFIER_SEEDS.includes(seed) ? [""] : ["", ..."abcdefghijklmnopqrstuvwxyz"];
    for (const l of letters) {
      for (const s of await google(l ? `${seed} ${l}` : `${seed} `, "en")) found.add(s);
      requests++;
      await sleep(200);
    }
    results.longTail[seed] = [...found].sort();
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(results, null, 2) + "\n");
  console.log(`${requests} requests, written to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
