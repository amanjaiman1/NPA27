#!/usr/bin/env node
/**
 * Guard against a silent Tailwind failure mode.
 *
 * `bg-accent/12` looks perfectly reasonable and compiles without a word of
 * warning — but 12 isn't on Tailwind's opacity scale, so the utility emits *no
 * CSS at all*. The element just quietly loses its background. This has bitten
 * this codebase twice: once it removed the scrims from the hero video, and once
 * it left every Badge tone, the topic-mastery ramp and the form focus ring with
 * no fill for several releases.
 *
 * Arbitrary values (`bg-black/[0.06]`) are always fine and are ignored.
 *
 *     npm run check:classes
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const SCALE = new Set([
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
]);

/** Utilities that take a *fraction* rather than an opacity — not our business. */
const FRACTIONAL = /^(inset|top|right|bottom|left|w|h|translate-x|translate-y|basis)(-|$)/;

const files = globSync("src/**/*.{ts,tsx}");
const pattern = /\b([a-z-]+(?:-\[[^\]]+\]|-[a-z0-9-]+))\/(\d+)\b/g;

let bad = 0;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(pattern)) {
      const [, util, num] = m;
      const value = Number(num);
      if (SCALE.has(value)) continue;
      // strip the colour token to get at the utility prefix
      const prefix = util.replace(
        /^(bg|text|border|fill|stroke|ring|from|via|to|shadow|divide|outline|accent|placeholder|decoration|caret)-/,
        "",
      );
      if (FRACTIONAL.test(prefix) || FRACTIONAL.test(util)) continue;
      console.error(`${file}:${i + 1}  ${util}/${num}  → not on the opacity scale (use a multiple of 5, or /[0.${num}])`);
      bad++;
    }
  });
}

if (bad) {
  console.error(`\n${bad} utility${bad === 1 ? "" : "ies"} would emit no CSS. Fix before shipping.`);
  process.exit(1);
}
console.log(`No off-scale opacity utilities in ${files.length} files.`);
