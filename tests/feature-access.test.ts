import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FEATURE_KEYS,
  canAccessFeature,
  everyoneProvider,
  featureForPath,
  resolveFeatureAccess,
  setFeatureAccessProvider,
  type FeatureAccessProvider,
  type FeatureKey,
} from "@/lib/features";
import { allNavItems, essentialNavItems, metricNavItems } from "@/lib/nav";
import { allowedNav } from "@/components/features/feature-access";

afterEach(() => setFeatureAccessProvider(null));

test("today every account, and no account at all, can use every feature", () => {
  for (const accountId of ["0d000000-0000-4000-8000-000000000004", null]) {
    const access = resolveFeatureAccess({ accountId });
    assert.equal(access.source, "everyone");
    for (const key of FEATURE_KEYS) assert.equal(canAccessFeature(access, key), true, key);
  }
});

test("every page in the app's navigation belongs to a feature", () => {
  for (const item of [...allNavItems, ...metricNavItems]) {
    assert.notEqual(featureForPath(item.href), null, `${item.href} has no feature`);
  }
  assert.equal(featureForPath("/wellbeing/sleep"), "life");
  assert.equal(featureForPath("/journal/2026-11-19"), "journal");
  assert.equal(featureForPath("/journalism"), null, "a prefix has to be a whole segment");
  assert.equal(featureForPath("/admin"), null, "the Admin Center is not a product feature");
});

test("a provider decides from the account alone, and the navigation follows it", () => {
  const seen: unknown[] = [];
  const noDiary: FeatureAccessProvider = {
    id: "test",
    resolve: (subject) => {
      seen.push(subject);
      return { has: (f: FeatureKey) => f !== "diary", source: "test" };
    },
  };
  setFeatureAccessProvider(noDiary);
  const access = resolveFeatureAccess({ accountId: "acc-1" });
  assert.deepEqual(seen, [{ accountId: "acc-1" }], "the provider is told the account and nothing else, no role");
  assert.equal(canAccessFeature(access, "diary"), false);
  assert.equal(canAccessFeature(access, "journal"), true);
  const nav = allowedNav(allNavItems, access).map((i) => i.href);
  assert.ok(!nav.includes("/diary") && nav.includes("/journal"));
  assert.equal(allowedNav(essentialNavItems, access).length, essentialNavItems.length);
  // Something outside every feature always stays.
  assert.equal(allowedNav([{ href: "/announcements-archive" }], access).length, 1);
  setFeatureAccessProvider(null);
  assert.equal(resolveFeatureAccess({ accountId: "acc-1" }).source, everyoneProvider.id);
});

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs|js)$/.test(f) ? [p] : [];
  });

test("there is no payment code anywhere: no billing package, no checkout, no plan gate", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: object; devDependencies?: object };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const d of deps) assert.ok(!/stripe|razorpay|paddle|lemonsqueezy|chargebee|paypal|braintree/i.test(d), `${d} is a payment package`);
  for (const file of files("src")) {
    const source = readFileSync(file, "utf8");
    assert.ok(!/from ["'](?:@stripe|stripe|razorpay)/i.test(source), `${file} imports a payment library`);
    assert.ok(!/\b(?:checkout\.stripe|api\.razorpay|isPremium|isPro\b|subscriptionTier|paywall)/i.test(source), `${file} looks like a paywall`);
  }
});
