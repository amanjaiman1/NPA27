import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import { readKey, setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { normalizeSnapshot } from "@/lib/account/normalize";
import { useChronicle, blankChronicleState, readCloudSnapshot } from "@/lib/store";
import { DEFAULT_THEME_MODE, THEME_MODES, isThemeMode, legacyThemeMode, surfaceFor } from "@/lib/theme";

const store = () => useChronicle.getState();

beforeEach(() => {
  setStorageBackend(new MemoryStorage() as unknown as Storage);
  setActiveAccount(null);
  useChronicle.setState(blankChronicleState());
});

test("there are three themes, Light, Dark and Lavender, and Lavender is the default", () => {
  assert.deepEqual(
    THEME_MODES.map((m) => m.label),
    ["Light", "Dark", "Lavender"],
  );
  assert.equal(DEFAULT_THEME_MODE, "lavender");
  assert.equal(store().themeMode, "lavender");
  for (const m of ["light", "dark", "lavender"]) assert.equal(isThemeMode(m), true);
  for (const retired of ["blue", "system", "ocean"]) assert.equal(isThemeMode(retired), false);
  assert.equal(surfaceFor("light"), "white");
  assert.equal(surfaceFor("dark"), "black");
  assert.equal(surfaceFor("lavender"), "lavender");
});

test("Lavender is kept as it is: chosen, synced, painted before load, and read back from the cloud", () => {
  setActiveAccount("account-a");
  store().setThemeMode("lavender");
  assert.equal(store().themeMode, "lavender");
  assert.equal(readCloudSnapshot().themeMode, "lavender");
  assert.equal(readKey("upsc-chronicle-theme:account-a"), "lavender");
  // Never mistaken for an older value.
  assert.equal(legacyThemeMode("lavender"), "lavender");
  assert.equal(normalizeSnapshot({ themeMode: "lavender" as const }).themeMode, "lavender");
  useChronicle.setState(blankChronicleState());
  store().applyCloudSnapshot({ themeMode: "lavender" });
  assert.equal(store().themeMode, "lavender");
  // Upgrading a store saved with it keeps it.
  const migrate = useChronicle.persist.getOptions().migrate!;
  const after = migrate({ themeMode: "lavender", journal: [] }, 15) as unknown as Record<string, unknown>;
  assert.equal(after.themeMode, "lavender");
});

test("a theme an older version saved opens as the theme it means today", () => {
  // Blue Glass became Light.
  assert.equal(legacyThemeMode("blue"), "light");
  // Auto settles on the theme the device shows.
  assert.equal(legacyThemeMode("system", true), "dark");
  assert.equal(legacyThemeMode("system", false), "light");
  // Light and Dark are kept, so an account that saved Light stays Light;
  // nothing saved, or anything unknown, is the default, Lavender.
  assert.equal(legacyThemeMode("dark"), "dark");
  assert.equal(legacyThemeMode("light"), "light");
  assert.equal(legacyThemeMode("ocean"), "lavender");
  assert.equal(legacyThemeMode(undefined), "lavender");

  // From another device, through the cloud.
  assert.equal(normalizeSnapshot({ themeMode: "blue" as never }).themeMode, "light");
  store().applyCloudSnapshot({ themeMode: "blue" as never });
  assert.equal(store().themeMode, "light");
});

test("the theme follows the account: synced, painted before load, and cleared on sign-out", () => {
  setActiveAccount("account-a");
  store().setThemeMode("dark");
  store().setReduceTransparency(true);
  // Synced with the account's data.
  assert.equal(readCloudSnapshot().themeMode, "dark");
  assert.equal(readCloudSnapshot().reduceTransparency, true);
  // Remembered under this account's own keys for the next cold start's first paint.
  assert.equal(readKey("upsc-chronicle-theme:account-a"), "dark");
  assert.equal(readKey("upsc-chronicle-transparency:account-a"), "reduced");
  assert.equal(readKey("upsc-chronicle-theme:account-b"), null, "no other account's key is touched");

  // Another device's choice arrives through the cloud and is painted next time too.
  store().applyCloudSnapshot({ themeMode: "light" });
  assert.equal(store().themeMode, "light");
  assert.equal(readKey("upsc-chronicle-theme:account-a"), "light");

  // Signing out (or switching account) goes back to the default look.
  useChronicle.setState(blankChronicleState());
  assert.equal(store().themeMode, "lavender");
  assert.equal(store().reduceTransparency, false);
});

test("an account that saved Light keeps it when the default changes", () => {
  const migrate = useChronicle.persist.getOptions().migrate!;
  const kept = migrate({ themeMode: "light", journal: [] }, 16) as unknown as Record<string, unknown>;
  assert.equal(kept.themeMode, "light");
  assert.equal(normalizeSnapshot({ themeMode: "light" as const }).themeMode, "light");
  store().applyCloudSnapshot({ themeMode: "light" });
  assert.equal(store().themeMode, "light");
});

test("colour palettes, Liquid Glass and wallpapers an older version saved are dropped, and nothing else changes", () => {
  const old = {
    themeMode: "dark" as const,
    palette: "lagoon",
    material: "glass",
    wallpaper: "ocean",
    wallpaperDim: 0.24,
    reduceTransparency: true,
    journal: [],
  };
  const next = normalizeSnapshot(old) as Record<string, unknown>;
  for (const k of ["palette", "material", "wallpaper", "wallpaperDim"]) assert.equal(k in next, false, `${k} dropped`);
  assert.equal(next.themeMode, "dark");
  assert.equal(next.reduceTransparency, true);
  assert.deepEqual(next.journal, []);

  // Pulled from another device, none of it reaches the store or the next upload.
  store().applyCloudSnapshot(old as never);
  const state = store() as unknown as Record<string, unknown>;
  const snap = readCloudSnapshot() as unknown as Record<string, unknown>;
  for (const k of ["palette", "material", "wallpaper"]) {
    assert.equal(k in state, false, `${k} not in the store`);
    assert.equal(k in snap, false, `${k} not synced`);
  }
  assert.equal(snap.themeMode, "dark");
});

test("upgrading a saved store settles the look once and keeps every record", () => {
  const migrate = useChronicle.persist.getOptions().migrate!;
  const journal = [{ id: "j1", date: "2026-11-01", totalHours: 5, blocks: [], mood: 4, energy: 3, motivation: 3, focus: 3 }];
  const saved = (themeMode: string) => ({ themeMode, palette: "rose", material: "glass", reduceTransparency: true, journal });

  const blue = migrate(structuredClone(saved("blue")), 15) as unknown as Record<string, unknown>;
  assert.equal(blue.themeMode, "light", "Blue Glass opens as Light");
  assert.equal("palette" in blue, false);
  assert.equal("material" in blue, false);
  assert.equal(blue.reduceTransparency, true, "Reduce transparency is kept");
  assert.deepEqual(blue.journal, journal);

  // Auto settles on the theme this device shows when it upgrades.
  const g = globalThis as { window?: unknown };
  g.window = { matchMedia: () => ({ matches: true }) };
  try {
    const auto = migrate(structuredClone(saved("system")), 15) as unknown as Record<string, unknown>;
    assert.equal(auto.themeMode, "dark");
  } finally {
    delete g.window;
  }
  const autoLight = migrate(structuredClone(saved("system")), 15) as unknown as Record<string, unknown>;
  assert.equal(autoLight.themeMode, "light", "a device with no dark preference opens in Light");

  const dark = migrate(structuredClone(saved("dark")), 15) as unknown as Record<string, unknown>;
  assert.equal(dark.themeMode, "dark");
});
