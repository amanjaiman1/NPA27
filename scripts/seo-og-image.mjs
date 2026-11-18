#!/usr/bin/env node
/**
 * Renders the social sharing card (Open Graph / X) at public/og/doordie.png,
 * 1200×630, from the dashboard screenshot made by scripts/seo-screenshots.ts.
 *
 *     node scripts/seo-og-image.mjs
 *
 * Re-run it after re-taking the screenshots or changing the brand.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shot = readFileSync(join(root, "public", "product", "dashboard.webp")).toString("base64");
const out = join(root, "public", "og", "doordie.png");

const logo = `<svg viewBox="0 0 32 32" width="64" height="64" fill="none">
  <circle cx="16" cy="16" r="12.5" stroke="rgba(22,49,71,0.3)" stroke-width="1.5"/>
  <circle cx="16" cy="16" r="7" stroke="rgba(22,49,71,0.15)" stroke-width="1.5"/>
  <line x1="16" y1="3.5" x2="16" y2="9" stroke="rgba(14,107,196,0.55)" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="16" cy="3.5" r="2.4" fill="#0e6bc4"/>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Poppins:wght@500;600&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #d6eefb; color: #163147;
         font-family: Poppins, system-ui, sans-serif; letter-spacing: -0.015em; }
  .aura { position: absolute; inset: 0;
    background: radial-gradient(64% 70% at 18% -10%, rgba(255,255,255,0.95), transparent 68%),
                radial-gradient(40% 70% at -6% 60%, rgba(100,188,235,0.6), transparent 72%),
                radial-gradient(50% 60% at 100% 0%, rgba(186,226,250,0.9), transparent 70%),
                radial-gradient(60% 60% at 90% 110%, rgba(122,196,240,0.5), transparent 72%),
                linear-gradient(165deg, #e2f3fd 0%, #d3ecfb 55%, #c6e6f9 100%); }
  .text { position: absolute; left: 72px; top: 76px; width: 520px; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand span { font-family: Comfortaa, sans-serif; font-weight: 700; font-size: 40px; letter-spacing: -0.04em; }
  h1 { margin-top: 56px; font-family: Comfortaa, sans-serif; font-weight: 700; font-size: 58px; line-height: 1.08; letter-spacing: -0.045em; }
  p { margin-top: 26px; font-size: 22px; line-height: 1.5; color: rgba(22,49,71,0.78); font-weight: 500; }
  .pill { display: inline-block; margin-top: 34px; padding: 12px 22px; border-radius: 999px; background: #0e6bc4; color: #fff;
          font-weight: 600; font-size: 20px; }
  .shot { position: absolute; left: 640px; top: 92px; width: 760px; border-radius: 22px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.85); box-shadow: 0 30px 60px -28px rgba(32,88,132,0.5); background: #fff; }
  .shot img { display: block; width: 100%; }
</style></head><body>
  <div class="aura"></div>
  <div class="text">
    <div class="brand">${logo}<span>DoOrDie</span></div>
    <h1>UPSC preparation tracker</h1>
    <p>Daily study log, topic-wise syllabus tracker, spaced revision and mock analytics in one private account.</p>
    <div class="pill">Free to use</div>
  </div>
  <div class="shot"><img src="data:image/webp;base64,${shot}" alt=""></div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await page.screenshot({ type: "png" }));
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
}
