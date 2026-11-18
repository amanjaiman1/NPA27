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

// Drawn in Lavender, the default theme: ink #181828 and violet #6c5ce7.
const logo = `<svg viewBox="0 0 32 32" width="64" height="64" fill="none">
  <circle cx="16" cy="16" r="12.5" stroke="rgba(24,24,40,0.3)" stroke-width="1.5"/>
  <circle cx="16" cy="16" r="7" stroke="rgba(24,24,40,0.15)" stroke-width="1.5"/>
  <line x1="16" y1="3.5" x2="16" y2="9" stroke="rgba(108,92,231,0.55)" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="16" cy="3.5" r="2.4" fill="#6c5ce7"/>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&family=Poppins:wght@500;600&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #f7f6fc; color: #181828;
         font-family: Poppins, system-ui, sans-serif; letter-spacing: -0.015em; }
  .aura { position: absolute; inset: 0;
    background: radial-gradient(42% 56% at 30% 10%, rgba(186,160,255,0.5), transparent 70%),
                radial-gradient(34% 50% at 8% 40%, rgba(255,196,168,0.5), transparent 70%),
                radial-gradient(30% 46% at 86% 16%, rgba(244,182,255,0.4), transparent 70%),
                radial-gradient(40% 54% at 4% 100%, rgba(120,226,212,0.38), transparent 70%),
                radial-gradient(40% 54% at 98% 100%, rgba(196,180,255,0.34), transparent 70%),
                linear-gradient(180deg, #fcfbff 0%, #f7f6fc 60%, #f3f1fa 100%); }
  .text { position: absolute; left: 72px; top: 76px; width: 520px; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand span { font-family: Comfortaa, sans-serif; font-weight: 700; font-size: 40px; letter-spacing: -0.04em; }
  h1 { margin-top: 56px; font-family: Comfortaa, sans-serif; font-weight: 700; font-size: 58px; line-height: 1.08; letter-spacing: -0.045em; }
  p { margin-top: 26px; font-size: 22px; line-height: 1.5; color: rgba(24,24,40,0.72); font-weight: 500; }
  .pill { display: inline-block; margin-top: 34px; padding: 12px 22px; border-radius: 999px; background: #6c5ce7; color: #fff;
          font-weight: 600; font-size: 20px; box-shadow: 0 12px 28px -14px rgba(108,92,231,0.7); }
  .shot { position: absolute; left: 640px; top: 92px; width: 760px; border-radius: 22px; overflow: hidden;
          border: 1px solid #eae7f4; box-shadow: 0 30px 60px -28px rgba(76,60,160,0.4); background: #fff; }
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
