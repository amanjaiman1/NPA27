// Renders chosen frames of a composition as JPEGs (one bundle, many frames).
//   node scripts/render/stills.mjs <Composition> <scale> <outDir> <frame> [frame...]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition, openBrowser } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";
const [id, scale, out, ...frames] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
fs.mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
const browserExecutable = process.env.REMOTION_BROWSER || null;
const browser = await openBrowser("chrome", { browserExecutable, chromiumOptions: { gl: "swangle" } });
const composition = await selectComposition({ serveUrl, id, puppeteerInstance: browser, browserExecutable });
for (const fr of frames.map(Number)) {
  const t = Date.now();
  await renderStill({ composition, serveUrl, frame: fr, output: path.join(out, `${id}-${String(fr).padStart(4, "0")}.jpeg`), imageFormat: "jpeg", jpegQuality: 88, scale: Number(scale), puppeteerInstance: browser, browserExecutable, timeoutInMilliseconds: 120000 });
  console.log("frame", fr, Date.now() - t, "ms");
}
await browser.close({ silent: true });
