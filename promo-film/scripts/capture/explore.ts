/**
 * A quick look at every page of the app in both themes, at 1x, to plan the
 * shots. Writes promo-film/.work/explore/<theme>-<page>.png (viewport) and
 * <theme>-<page>-full.png (whole page).
 *
 *     npx tsx promo-film/scripts/capture/explore.ts
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { APP, FILM_ROOT, createDemoAccount, launch, newContext, passSleepPromptIfShown, setTheme, settle, startServers, stopServers } from "./session";
import { daysAgo } from "./demo-data";

const OUT = join(FILM_ROOT, ".work", "explore");
const PAGES: [string, string][] = [
  ["dashboard", "/dashboard"],
  ["journal", "/journal"],
  ["journal-new", "/journal?new=1"],
  ["journal-day", `/journal/${daysAgo(1)}`],
  ["goals", "/goals"],
  ["wellbeing", "/wellbeing"],
  ["sleep", "/wellbeing/sleep"],
  ["running", "/wellbeing/running"],
  ["screen", "/wellbeing/screen"],
  ["revision", "/revision"],
  ["roadmap", "/roadmap"],
  ["current-affairs", "/current-affairs"],
  ["mistakes", "/mistakes"],
  ["habits", "/habits"],
  ["books", "/books"],
  ["heatmap", "/heatmap"],
  ["subjects", "/subjects"],
  ["mocks", "/mocks"],
  ["knowledge-graph", "/knowledge-graph"],
  ["reviews", "/reviews"],
  ["diary", "/diary"],
  ["coach", "/coach"],
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  await startServers();
  const browser = await launch();
  try {
    const context = await newContext(browser, { width: 1536, height: 960, scale: 1 });
    const page = await context.newPage();
    await createDemoAccount(page, "light");
    for (const theme of ["light", "dark"] as const) {
      await page.goto(`${APP}/dashboard`);
      await settle(page, 800);
      await setTheme(page, theme);
      for (const [name, path] of PAGES) {
        await page.goto(`${APP}${path}`);
        await passSleepPromptIfShown(page);
        await settle(page, 1400);
        await page.screenshot({ path: join(OUT, `${theme}-${name}.png`) });
        await page.screenshot({ path: join(OUT, `${theme}-${name}-full.png`), fullPage: true });
        console.log(theme, name);
      }
    }
    const phone = await newContext(browser, { width: 390, height: 844, scale: 2, mobile: true });
    const p2 = await phone.newPage();
    await createDemoAccount(p2, "light", "demo.phone@example.com");
    for (const [name, path] of [["dashboard", "/dashboard"], ["journal-new", "/journal?new=1"], ["wellbeing", "/wellbeing"]] as const) {
      await p2.goto(`${APP}${path}`);
      await passSleepPromptIfShown(p2);
      await settle(p2, 1200);
      await p2.screenshot({ path: join(OUT, `phone-light-${name}.png`) });
      await p2.screenshot({ path: join(OUT, `phone-light-${name}-full.png`), fullPage: true });
    }
  } finally {
    await browser.close();
    stopServers();
  }
}

main().catch((e) => {
  console.error(e);
  stopServers();
  process.exit(1);
});
