// Renders a composition to a JPEG sequence with Remotion, in parallel tabs.
//   node scripts/render/frames.mjs <Composition> <scale> <outDir> [from-to] [concurrency]
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition, openBrowser } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";
const [id, scale, out, range, conc] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
fs.mkdirSync(out, { recursive: true });
const binariesDirectory = path.join(root, "node_modules/@remotion/compositor-linux-x64-musl");
const browserExecutable = process.env.REMOTION_BROWSER || null;
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
const browser = await openBrowser("chrome", { browserExecutable, chromiumOptions: { gl: "swangle" } });
const composition = await selectComposition({ serveUrl, id, puppeteerInstance: browser, browserExecutable, binariesDirectory });
const frameRange = range ? range.split("-").map(Number) : null;
const t0 = Date.now();
let last = 0;
await renderFrames({
  composition, serveUrl, outputDir: out, imageFormat: "jpeg", jpegQuality: 94, scale: Number(scale),
  frameRange, concurrency: Number(conc || 6), puppeteerInstance: browser, browserExecutable, binariesDirectory,
  timeoutInMilliseconds: 180000, chromiumOptions: { gl: "swangle" },
  onStart: ({ frameCount }) => console.log("frames", frameCount),
  onFrameUpdate: (n) => { if (n - last >= 120) { last = n; console.log(n, "done", Math.round((Date.now() - t0) / 1000), "s"); } },
});
console.log("finished in", Math.round((Date.now() - t0) / 1000), "s");
await browser.close({ silent: true });
